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

  for (const bt of bankTxs) {
    const cash = cashTxs.find(
      (ct) => !usedCash.has(ct.id) && ct.date === bt.date && Math.abs(Math.abs(ct.amount) - Math.abs(bt.amount)) < 0.01
    );
    const rule = matchRule(bt.description, rules);
    if (rule) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;
    if (cash) usedCash.add(cash.id);

    let status, reasoning;
    if (cash && rule) {
      status = "reconciled";
      reasoning = `Match exato com lançamento de caixa (data ${bt.date}, valor ${bt.amount.toFixed(2)}) e regra do dicionário "${rule.keyword}" → ${rule.map_to}${rule.category ? ` (categoria: ${rule.category})` : ""}.`;
    } else if (cash) {
      status = "reconciled";
      reasoning = `Match exato com lançamento de caixa por data e valor. Nenhuma regra do dicionário reconheceu a descrição.`;
    } else if (rule) {
      status = "reconciled";
      reasoning = `Sem par no caixa. Classificado pela regra do dicionário "${rule.keyword}" → ${rule.map_to}${rule.category ? ` (categoria: ${rule.category})` : ""}.`;
    } else {
      status = "pending";
      reasoning = "Nenhum lançamento de caixa correspondente (data + valor) e nenhuma regra do dicionário reconheceu a descrição original.";
    }

    records.push({
      tenant_id: bt.tenant_id,
      bank_transaction_id: bt.id,
      cash_transaction_id: cash ? cash.id : null,
      reconciliation_date: bt.date,
      status,
      ai_classification: rule ? rule.category || rule.map_to : cash ? "Match com caixa" : "Não classificado",
      ai_reasoning: reasoning,
      matched_by_rule_id: rule ? rule.id : null,
      category: rule ? rule.category || "" : "",
      responsible: rule ? rule.map_to : cash ? cash.operator || "" : "",
      cost_center_id: rule ? rule.cost_center_id || "" : "",
      payment_method: cash ? cash.payment_method || "" : "",
      amount: bt.type === "debit" ? -Math.abs(bt.amount) : Math.abs(bt.amount),
      description: bt.description || "",
    });
  }

  // Lançamentos de caixa sem par bancário → pendentes
  for (const ct of cashTxs) {
    if (usedCash.has(ct.id)) continue;
    const rule = matchRule(ct.description, rules);
    if (rule) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;
    records.push({
      tenant_id: ct.tenant_id,
      bank_transaction_id: null,
      cash_transaction_id: ct.id,
      reconciliation_date: ct.date,
      status: "divergent",
      ai_classification: rule ? rule.category || rule.map_to : "Caixa sem par bancário",
      ai_reasoning: `Lançamento de caixa sem transação bancária correspondente (data ${ct.date}, valor ${ct.amount.toFixed(2)}).${rule ? ` Regra "${rule.keyword}" → ${rule.map_to} aplicada para classificação.` : ""}`,
      matched_by_rule_id: rule ? rule.id : null,
      category: rule ? rule.category || "" : "",
      responsible: rule ? rule.map_to : ct.operator || "",
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