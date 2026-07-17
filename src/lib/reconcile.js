// Motor de conciliação (etapa 1: regras determinísticas do dicionário + match caixa)
// Os Agentes de IA futuros substituirão/estenderão este módulo mantendo o mesmo contrato.

export function parseOFX(text) {
  const blocks = text.split(new RegExp("<STMTTRN>", "i")).slice(1);
  return blocks
    .map((b) => {
      const get = (tag) => {
        const m = b.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
        return m ? m[1].trim() : "";
      };
      const raw = get("DTPOSTED");
      const date = raw ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : "";
      const amt = parseFloat(get("TRNAMT").replace(",", "."));
      return {
        date,
        amount: Math.abs(amt),
        type: amt < 0 ? "debit" : "credit",
        description: get("MEMO") || get("NAME"),
        transaction_id_ofx: get("FITID"),
      };
    })
    .filter((t) => t.date && !isNaN(t.amount));
}

export function matchRule(description, rules) {
  const desc = (description || "").toUpperCase();
  return (
    rules.find(
      (r) => r.is_active !== false && r.keyword && desc.includes(r.keyword.toUpperCase())
    ) || null
  );
}

export function runReconciliation({ bankTxs, cashTxs, rules }) {
  const usedCash = new Set();
  const records = [];
  const ruleHits = {};

  // NOTA (Fase 0 do plano de precisão cirúrgica): coincidência de data+valor entre
  // banco e caixa, sozinha, NÃO é prova de que são a mesma transação — já causou
  // pareamentos errados reais em produção (ex.: um Pix de terceiro casado com um
  // total de faturamento do dia só porque o valor batia). "reconciled" agora só é
  // atribuído quando existe uma regra do dicionário reconhecendo a descrição. Um
  // par de caixa por coincidência de valor vira, no máximo, uma sugestão no
  // ai_reasoning de um registro que continua "pending" — nunca confirma sozinho.
  for (const bt of bankTxs) {
    const cash = cashTxs.find(
      (ct) => !usedCash.has(ct.id) && ct.date === bt.date && Math.abs(Math.abs(ct.amount) - Math.abs(bt.amount)) < 0.01
    );
    const rule = matchRule(bt.description, rules);
    if (rule) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;

    let status, reasoning;
    if (rule) {
      status = "reconciled";
      if (cash) usedCash.add(cash.id);
      reasoning = `Classificado pela regra do dicionário "${rule.keyword}" → ${rule.map_to}${rule.category ? ` (categoria: ${rule.category})` : ""}.${cash ? ` Também há um lançamento de caixa com mesma data/valor (id ${cash.id}) — sugestão, não confirmado automaticamente por isso.` : ""}`;
    } else if (cash) {
      status = "pending";
      reasoning = `Possível correspondência por coincidência de data e valor com um lançamento de caixa (id ${cash.id}) — nenhuma regra do dicionário reconheceu a descrição, então NÃO foi conciliado automaticamente. Revisão humana necessária antes de confirmar.`;
    } else {
      status = "pending";
      reasoning = "Nenhum lançamento de caixa correspondente (data + valor) e nenhuma regra do dicionário reconheceu a descrição original.";
    }

    records.push({
      tenant_id: bt.tenant_id,
      bank_transaction_id: bt.id,
      cash_transaction_id: rule && cash ? cash.id : null,
      reconciliation_date: bt.date,
      status,
      ai_classification: rule ? rule.category || rule.map_to : "Não classificado",
      ai_reasoning: reasoning,
      matched_by_rule_id: rule ? rule.id : null,
      category: rule ? rule.category || "" : "",
      responsible: rule ? rule.map_to : "",
      cost_center_id: rule ? rule.cost_center_id || "" : "",
      payment_method: rule && cash ? cash.payment_method || "" : "",
      amount: bt.type === "debit" ? -Math.abs(bt.amount) : Math.abs(bt.amount),
      description: bt.description || "",
    });
  }

  // Lançamentos de caixa sem par bancário confirmado → pendentes (não é uma
  // divergência real, é só "ainda sem par"; "divergent" deve ficar reservado
  // para quando há de fato um problema identificado).
  for (const ct of cashTxs) {
    if (usedCash.has(ct.id)) continue;
    const rule = matchRule(ct.description, rules);
    if (rule) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;
    records.push({
      tenant_id: ct.tenant_id,
      bank_transaction_id: null,
      cash_transaction_id: ct.id,
      reconciliation_date: ct.date,
      status: rule ? "reconciled" : "pending",
      ai_classification: rule ? rule.category || rule.map_to : "Caixa sem par bancário",
      ai_reasoning: `Lançamento de caixa sem transação bancária correspondente (data ${ct.date}, valor ${ct.amount.toFixed(2)}).${rule ? ` Regra "${rule.keyword}" → ${rule.map_to} aplicada para classificação.` : " Nenhuma regra do dicionário reconheceu a descrição — revisão humana necessária."}`,
      matched_by_rule_id: rule ? rule.id : null,
      category: rule ? rule.category || "" : "",
      responsible: rule ? rule.map_to : "",
      cost_center_id: rule ? rule.cost_center_id || "" : "",
      payment_method: ct.payment_method || "",
      amount: ct.amount,
      description: ct.description || "",
    });
  }

  return { records, usedCash, ruleHits };
}

const fmtDateBR = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const fmtValueBR = (n) => (typeof n === "number" ? n.toFixed(2).replace(".", ",") : "");

// Formato ESTRITO Conta Azul: 10 colunas oficiais, nesta ordem.
export function buildContaAzulCSV(records, costCentersById) {
  const header = [
    "Data de Competência",
    "Data de Vencimento",
    "Data de Pagamento",
    "Valor",
    "Categoria",
    "Descrição",
    "Cliente/Fornecedor",
    "CNPJ/CPF Cliente/Fornecedor",
    "Centro de Custo",
    "Observações",
  ];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = records.map((r) => {
    const cc = costCentersById[r.cost_center_id];
    return [
      fmtDateBR(r.reconciliation_date),
      fmtDateBR(r.reconciliation_date),
      fmtDateBR(r.reconciliation_date),
      fmtValueBR(r.amount),
      r.category || "",
      r.description || "",
      r.responsible || "",
      r.cnpj_cpf || "",
      cc ? `${cc.code}- ${cc.name}` : "",
      r.notes || "",
    ].map(esc).join(";");
  });
  return [header.map(esc).join(";"), ...rows].join("\n");
}