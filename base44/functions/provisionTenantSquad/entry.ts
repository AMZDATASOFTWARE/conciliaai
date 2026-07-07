import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// FÁBRICA DE SQUADS — provisiona a Pirâmide Cognitiva dedicada de um tenant.
// Idempotente: se o squad já existir para o tenant_id, não cria duplicatas.
// Cada agente é uma instância exclusiva (namespace: {role}_{tenant_id}) com
// instructions e skills próprias, editáveis por cliente sem afetar os demais.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { tenantId } = await req.json();
    if (!tenantId) return Response.json({ error: 'tenantId é obrigatório' }, { status: 400 });

    // Garante que o tenant existe antes de provisionar
    const tenant = await base44.entities.Tenant.get(tenantId);
    if (!tenant) return Response.json({ error: 'Tenant não encontrado' }, { status: 404 });

    // Idempotência: squad já provisionado?
    const existing = await base44.entities.TenantAgent.filter({ tenant_id: tenantId });
    if (existing.length > 0) {
      return Response.json({ already_provisioned: true, agents: existing.map((a) => a.agent_name) });
    }

    const now = new Date().toISOString();
    const squadTemplates = [
      {
        tenant_id: tenantId,
        agent_name: `analista_financeiro_${tenantId}`,
        role: 'analista',
        instructions: `Você é o Analista Financeiro dedicado do cliente "${tenant.name}". Sua missão é cruzar os dados brutos (raw_data) das transações bancárias com o caixa físico deste cliente, aplicando busca semântica/fuzzy matching, extração de tickets e datas de descrições longas e validação matemática ao centavo. Você APENAS sugere matches — nunca grava no banco. Você só pode acessar dados com tenant_id=${tenantId}.`,
        skills: ['Leitura de DB (read: BankTransaction, CashTransaction)', 'Processamento JSON (raw_data)', 'Extração de Dados', 'Operações Matemáticas', 'Busca Semântica / Fuzzy Matching'],
        status: 'active',
        provisioned_at: now,
      },
      {
        tenant_id: tenantId,
        agent_name: `supervisor_bpo_${tenantId}`,
        role: 'supervisor',
        instructions: `Você é o Supervisor de BPO dedicado do cliente "${tenant.name}". Sua missão é validar as sugestões do Analista consultando as regras (ReconciliationRule) e a memória (TenantMemoryContext) EXCLUSIVAS deste cliente antes de persistir o resultado, preenchendo obrigatoriamente a justificativa técnica (ai_reasoning). Você só pode acessar dados com tenant_id=${tenantId}.`,
        skills: ['Escrita em DB (create/update: ReconciledRecord, BankTransaction, CashTransaction)', 'Leitura Vetorial / RAG (TenantMemoryContext)', 'Motor de Regras Lógicas (ReconciliationRule)', 'Fluxo de Aprovação / Roteamento', 'Geração de Justificativa (ai_reasoning)'],
        status: 'active',
        provisioned_at: now,
      },
      {
        tenant_id: tenantId,
        agent_name: `diretor_financeiro_${tenantId}`,
        role: 'diretor',
        instructions: `Você é o Diretor Financeiro dedicado do cliente "${tenant.name}". Sua missão é gerar relatórios executivos focados em risco, divergências, fuga de caixa, passivos trabalhistas e mistura PF x PJ deste cliente. Você só pode acessar dados com tenant_id=${tenantId}.`,
        skills: ['Leitura de DB (read: ReconciledRecord)', 'Sumarização de Textos', 'Análise Financeira e de Risco', 'Geração de Relatórios Executivos'],
        status: 'active',
        provisioned_at: now,
      },
    ];

    const created = await base44.entities.TenantAgent.bulkCreate(squadTemplates);
    return Response.json({ provisioned: true, agents: created.map((a) => a.agent_name) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});