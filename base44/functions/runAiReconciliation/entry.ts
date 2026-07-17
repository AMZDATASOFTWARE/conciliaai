import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// PIRÂMIDE COGNITIVA — Squad hierárquico por tenant:
// Nível 1 (Analista Financeiro): lê raw_data, fuzzy matching, extração de dados — só sugere, não grava.
// Nível 2 (Supervisor de BPO): valida sugestões contra memória (RAG) + regras do tenant, grava com ai_reasoning.
// Nível 3 (Diretor Financeiro): audita o lote e gera resumo executivo de riscos (PF x PJ, fugas de caixa).
// Segurança: todos os dados são carregados filtrados por tenant_id; IDs retornados pela IA
// só são aceitos se pertencerem ao conjunto carregado do próprio tenant.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tenantId } = await req.json();
    if (!tenantId) return Response.json({ error: 'tenantId é obrigatório' }, { status: 400 });

    // ===== Contexto isolado do tenant =====
    const [bankTxns, cashTxns, rules, memory, squadAgents] = await Promise.all([
      base44.entities.BankTransaction.filter({ tenant_id: tenantId, status: 'pending' }, 'date', 150),
      base44.entities.CashTransaction.filter({ tenant_id: tenantId, status: 'pending' }, 'date', 300),
      base44.entities.ReconciliationRule.filter({ tenant_id: tenantId, is_active: true }, '-match_count', 200),
      base44.entities.TenantMemoryContext.filter({ tenant_id: tenantId }, '-created_date', 50),
      base44.entities.TenantAgent.filter({ tenant_id: tenantId }),
    ]);

    // Squad dedicado do tenant: cada nível da pirâmide executa as instruções da SUA instância
    const squad = Object.fromEntries(squadAgents.map((a) => [a.role, a]));
    const squadInstruction = (role) =>
      squad[role] ? `[AGENTE DEDICADO: ${squad[role].agent_name}]\nINSTRUÇÕES DO SQUAD: ${squad[role].instructions}\n\n` : '';

    if (bankTxns.length === 0) {
      return Response.json({ analyzed: 0, reconciled: 0, divergent: 0, report: 'Nenhuma transação bancária pendente para este cliente.' });
    }

    const bankById = new Map(bankTxns.map((t) => [t.id, t]));
    const cashById = new Map(cashTxns.map((t) => [t.id, t]));
    const ruleIds = new Set(rules.map((r) => r.id));
    const today = new Date().toISOString().slice(0, 10);
    const rulesForPrompt = rules.map((r) => ({ id: r.id, keyword: r.keyword, map_to: r.map_to, category: r.category, is_pf: r.is_pf }));
    const memoryForPrompt = memory.map((m) => ({ content: m.content, source: m.source_description }));

    // Processa em lotes pequenos: um único InvokeLLM com 150+ transações costuma
    // devolver decisão pra só uma fração do lote (o modelo "esquece" itens). Lotes
    // de 40 garantem cobertura muito mais alta, e a rede de segurança abaixo cobre
    // o resto.
    const BATCH_SIZE = 40;
    const bankBatches = [];
    for (let i = 0; i < bankTxns.length; i += BATCH_SIZE) {
      bankBatches.push(bankTxns.slice(i, i + BATCH_SIZE));
    }

    const records = [];
    const bankUpdates = [];
    const cashUpdates = [];
    const decidedBankIds = new Set();
    const usedCashIds = new Set();

    for (const batch of bankBatches) {
      const bankList = batch.map((t) => ({ id: t.id, date: t.date, amount: t.amount, type: t.type, description: t.description, raw_data: t.raw_data }));
      // Só oferece lançamentos de caixa ainda não consumidos por lotes anteriores desta mesma execução
      const cashList = cashTxns.filter((c) => !usedCashIds.has(c.id)).map((t) => ({ id: t.id, date: t.date, amount: t.amount, payment_method: t.payment_method, ticket: t.ticket, description: t.description, operator: t.operator, raw_data: t.raw_data }));

      // ===== NÍVEL 1: Agente Analista Financeiro (O Processador) =====
      const analystResult = await base44.integrations.Core.InvokeLLM({
        prompt: `${squadInstruction('analista')}Você é o AGENTE ANALISTA FINANCEIRO de um BPO financeiro. Sua missão é APENAS SUGERIR correspondências (matches) entre transações bancárias e lançamentos de caixa de UM ÚNICO cliente. Você NÃO grava nada no banco.

SKILLS ATIVAS: interpretação de JSON (raw_data), busca semântica/fuzzy matching (nomes parecidos, abreviações, apelidos como "Wilson" vs "Jhennifer"), extração de dados (tickets e datas dentro de descrições longas) e operações matemáticas (a soma deve bater NO CENTAVO — compare valores absolutos, débitos bancários vêm negativos).

REGRAS:
- Um lançamento de caixa pode corresponder a no máximo 1 transação bancária e vice-versa.
- Uma transação bancária pode corresponder à SOMA de vários lançamentos de caixa do mesmo dia (informe todos os cash_transaction_ids).
- Transferências internas (ex: "Dinheiro Guardado", movimentações entre contas do próprio cliente) não precisam de par no caixa — classifique como tal em vez de deixar sem match.
- Use o raw_data para contexto extra (colunas originais do cliente).
- Datas podem divergir em até 2 dias (compensação).
- Atribua confidence de 0 a 1. Transações bancárias sem nenhum candidato entram em "unmatched_bank_ids".

TRANSAÇÕES BANCÁRIAS (JSON) — ${bankList.length} itens, você DEVE classificar TODOS, sem exceção (em suggestions OU em unmatched_bank_ids):
${JSON.stringify(bankList)}

LANÇAMENTOS DE CAIXA DISPONÍVEIS (JSON):
${JSON.stringify(cashList)}`,
        response_json_schema: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bank_transaction_id: { type: 'string' },
                  cash_transaction_ids: { type: 'array', items: { type: 'string' } },
                  confidence: { type: 'number' },
                  extracted_info: { type: 'string', description: 'Tickets, nomes e datas extraídos das descrições' },
                  match_logic: { type: 'string', description: 'Como o match foi encontrado (fuzzy, soma, ticket...)' },
                },
              },
            },
            unmatched_bank_ids: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      const suggestions = (analystResult.suggestions || []).filter((s) => bankById.has(s.bank_transaction_id));
      const unmatchedIds = (analystResult.unmatched_bank_ids || []).filter((id) => bankById.has(id));

      // ===== NÍVEL 2: Agente Supervisor de BPO (O Validador) =====
      const supervisorResult = await base44.integrations.Core.InvokeLLM({
        prompt: `${squadInstruction('supervisor')}Você é o AGENTE SUPERVISOR DE BPO. Você recebeu sugestões de match do Agente Analista e deve VALIDÁLAS ou REJEITÁ-LAS antes da gravação no banco, consultando a MEMÓRIA do cliente (RAG) e o MOTOR DE REGRAS (dicionário De/Para).

SKILLS ATIVAS: consulta à memória do cliente, motor de regras lógicas, fluxo de aprovação/roteamento e geração de justificativa técnica.

OBRIGATÓRIO: você DEVE retornar exatamente uma decisão para CADA UMA das ${batch.length} transações listadas em "TODOS OS IDS DO LOTE" abaixo — inclusive as que não têm sugestão de match. Nenhuma pode ficar de fora. Para cada decisão, preencha "ai_reasoning" explicando tecnicamente POR QUE aprovou ou rejeitou (cite valores, regra usada, trecho da memória). Nunca deixe vazio.

MEMÓRIA DO CLIENTE (diretrizes, ex: "combos são descontos", "iFood é despesa PF"):
${JSON.stringify(memoryForPrompt)}

REGRAS DE CONCILIAÇÃO (dicionário keyword -> mapeamento/categoria):
${JSON.stringify(rulesForPrompt)}

SUGESTÕES DO ANALISTA:
${JSON.stringify(suggestions)}

TRANSAÇÕES BANCÁRIAS SEM SUGESTÃO DE MATCH (avalie se há regra/memória/transferência interna que as classifique; senão marque approved=false):
${JSON.stringify(unmatchedIds.map((id) => bankById.get(id)))}

TODOS OS IDS DO LOTE (garanta que nenhum destes fica sem decisão):
${JSON.stringify(bankList.map((b) => b.id))}

Para cada transação bancária do lote retorne uma decisão. "approved"=true significa conciliada; false significa divergente (precisa de humano). Se uma regra do dicionário foi usada, informe matched_by_rule_id.`,
        response_json_schema: {
          type: 'object',
          properties: {
            decisions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  bank_transaction_id: { type: 'string' },
                  cash_transaction_ids: { type: 'array', items: { type: 'string' } },
                  approved: { type: 'boolean' },
                  ai_classification: { type: 'string' },
                  ai_reasoning: { type: 'string' },
                  category: { type: 'string' },
                  responsible: { type: 'string' },
                  payment_method: { type: 'string' },
                  matched_by_rule_id: { type: 'string' },
                  is_pf: { type: 'boolean' },
                },
                required: ['bank_transaction_id', 'approved', 'ai_reasoning'],
              },
            },
          },
        },
      });

      for (const d of supervisorResult.decisions || []) {
        const bt = bankById.get(d.bank_transaction_id);
        if (!bt || decidedBankIds.has(bt.id)) continue; // segurança: ignora IDs fora do tenant/lote ou duplicados
        const cashIds = (d.cash_transaction_ids || []).filter((id) => cashById.has(id) && !usedCashIds.has(id));
        const status = d.approved ? 'reconciled' : 'divergent';

        records.push({
          tenant_id: tenantId,
          bank_transaction_id: bt.id,
          cash_transaction_id: cashIds[0] || null,
          reconciliation_date: today,
          status,
          ai_classification: d.ai_classification || (d.approved ? 'Match validado pelo Supervisor' : 'Divergência'),
          ai_reasoning: d.ai_reasoning || 'Sem justificativa fornecida.',
          matched_by_rule_id: d.matched_by_rule_id && ruleIds.has(d.matched_by_rule_id) ? d.matched_by_rule_id : null,
          category: d.category || null,
          responsible: d.responsible || null,
          payment_method: d.payment_method || bt.type,
          notes: d.is_pf ? 'Possível despesa PF (pessoa física)' : null,
        });
        bankUpdates.push({ id: bt.id, status });
        cashIds.forEach((id) => { cashUpdates.push({ id, status }); usedCashIds.add(id); });
        decidedBankIds.add(bt.id);
      }
    }

    // Rede de segurança: nenhuma transação buscada nesta execução pode ficar sem
    // decisão. Se a IA não devolveu decisão pra algum item do lote, marca como
    // divergente para revisão humana em vez de deixar 'pending' silenciosamente
    // (era exatamente isso que fazia a maioria das transações "sumir" sem gerar
    // nenhum ReconciledRecord).
    for (const bt of bankTxns) {
      if (decidedBankIds.has(bt.id)) continue;
      records.push({
        tenant_id: tenantId,
        bank_transaction_id: bt.id,
        cash_transaction_id: null,
        reconciliation_date: today,
        status: 'divergent',
        ai_classification: 'Sem decisão da IA',
        ai_reasoning: 'A IA não retornou uma decisão para este lançamento nesta execução; marcado como divergente para revisão manual.',
        matched_by_rule_id: null,
        category: null,
        responsible: null,
        payment_method: bt.type,
        notes: null,
      });
      bankUpdates.push({ id: bt.id, status: 'divergent' });
    }

    if (records.length > 0) await base44.entities.ReconciledRecord.bulkCreate(records);
    if (bankUpdates.length > 0) await base44.entities.BankTransaction.bulkUpdate(bankUpdates);
    if (cashUpdates.length > 0) await base44.entities.CashTransaction.bulkUpdate(cashUpdates);

    const reconciled = records.filter((r) => r.status === 'reconciled').length;
    const divergent = records.filter((r) => r.status === 'divergent').length;

    // ===== NÍVEL 3: Agente Diretor Financeiro (O Estrategista) =====
    const report = await base44.integrations.Core.InvokeLLM({
      prompt: `${squadInstruction('diretor')}Você é o AGENTE DIRETOR FINANCEIRO de um BPO. Analise o lote de conciliações abaixo e gere um RESUMO DE AUDITORIA EXECUTIVO em Markdown (títulos, bullets, negrito).

SKILLS ATIVAS: análise financeira e de risco, sumarização e geração de relatórios executivos.

Destaque obrigatoriamente, quando houver indícios:
1. **Fugas de caixa** (valores no caixa sem espelho no banco ou vice-versa);
2. **Passivos trabalhistas** (pagamentos recorrentes a pessoas físicas, diárias);
3. **Mistura PF x PJ** (gastos pessoais do sócio na conta da empresa);
4. Estatísticas do lote e recomendações práticas para o operador do BPO.

Seja objetivo (máx ~400 palavras). Responda em português.

MEMÓRIA DO CLIENTE: ${JSON.stringify(memory.map((m) => m.content))}

LOTE PROCESSADO (${records.length} registros — ${reconciled} conciliados, ${divergent} divergentes):
${JSON.stringify(records.map((r) => ({ status: r.status, classification: r.ai_classification, reasoning: r.ai_reasoning, category: r.category, responsible: r.responsible, notes: r.notes, amount: bankById.get(r.bank_transaction_id)?.amount, description: bankById.get(r.bank_transaction_id)?.description })))}`,
    });

    return Response.json({ analyzed: bankTxns.length, reconciled, divergent, report });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});