// Motor de conciliação determinístico de 3 pontas: Caixa ↔ Maquininha ↔ Banco.
// Fase 4 do plano de precisão cirúrgica. Sem LLM — só aritmética exata usando o
// relatório de vendas da maquininha (bruto/taxa/líquido) como a peça de dado que
// faltava para reconciliar receita de cartão sem depender de heurística de
// coincidência de valor (o motor antigo em reconcile.js já mostrou que isso gera
// falsos positivos).
//
// Só grava um registro "reconciled" quando a cadeia INTEIRA fecha (caixa == soma
// bruta da maquininha do dia, e banco == soma líquida da maquininha do lote).
// Cadeias parciais ficam intocadas (continuam "pending") para revisão humana ou
// para o Squad de IA processar depois.

const TOLERANCE = 0.05;

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function cardTypeBucket(cardType) {
  if (cardType === "credit" || cardType === "credit_installment") return "credit";
  if (cardType === "debit") return "debit";
  if (cardType === "pix") return "pix";
  return "unknown";
}

function paymentMethodMatchesBucket(paymentMethod, bucket) {
  const s = normalizeText(paymentMethod);
  if (bucket === "debit") return s.includes("debito");
  if (bucket === "credit") return s.includes("credito");
  if (bucket === "pix") return s.includes("pix");
  return false;
}

function daysDiff(d1, d2) {
  return Math.abs((new Date(d1) - new Date(d2)) / 86400000);
}

const round2 = (n) => Math.round(n * 100) / 100;

export function run3WayReconciliation({ bankTxs, cashTxs, acquirerSettlements }) {
  const records = [];
  // Working sets usados só durante as etapas, pra não reaproveitar o mesmo
  // caixa/banco/liquidação em duas cadeias diferentes nesta execução.
  // reservedCashIds é reservado já na Etapa 1, ANTES da Etapa 2 validar o banco
  // — se a Etapa 2 falhar, esse caixa fica "reservado" aqui mas SEM registro
  // criado. matchedBankIds/matchedAcquirerIds só recebem algo quando a cadeia
  // fecha de verdade (dentro do bloco `if (allBatchesMatched)`), então são
  // sempre precisos. Por segurança, os três sets devolvidos no final são
  // recalculados a partir de `records`, nunca dos working sets diretamente.
  const reservedCashIds = new Set();
  const matchedBankIds = new Set();
  const matchedAcquirerIds = new Set();

  // ===== Etapa 1: Caixa <-> Maquininha (bruto, mesmo dia) =====
  // Agrupa liquidações por dia da venda + modalidade (débito/crédito/pix), soma o
  // valor bruto de cada grupo e procura um lançamento de caixa do mesmo dia cuja
  // forma de pagamento combine com a modalidade e cujo valor bata com a soma.
  const groupsByDay = new Map(); // key: `${sale_date}|${bucket}` -> settlements[]
  for (const s of acquirerSettlements) {
    const bucket = cardTypeBucket(s.card_type);
    const key = `${s.sale_date}|${bucket}`;
    if (!groupsByDay.has(key)) groupsByDay.set(key, []);
    groupsByDay.get(key).push(s);
  }

  const chains = []; // { cash, settlements } — grupos que já bateram com o caixa, aguardando etapa 2
  for (const [key, settlements] of groupsByDay) {
    const [saleDate, bucket] = key.split("|");
    const grossSum = round2(settlements.reduce((sum, s) => sum + s.gross_amount, 0));
    const cash = cashTxs.find(
      (ct) =>
        !reservedCashIds.has(ct.id) &&
        ct.date === saleDate &&
        paymentMethodMatchesBucket(ct.payment_method, bucket) &&
        Math.abs(ct.amount - grossSum) < TOLERANCE
    );
    if (!cash) continue;
    reservedCashIds.add(cash.id);
    chains.push({ cash, settlements });
  }

  // ===== Etapa 2: Maquininha <-> Banco (líquido, data de liquidação +-1 dia) =====
  // Dentro de cada cadeia já validada na etapa 1, agrupa por lote (batch_reference)
  // + data de liquidação — um mesmo lote costuma cair junto num único depósito.
  for (const { cash, settlements } of chains) {
    const byBatch = new Map(); // key: `${settlement_date}|${batch_reference}` -> settlements[]
    for (const s of settlements) {
      const key = `${s.settlement_date}|${s.batch_reference || ""}`;
      if (!byBatch.has(key)) byBatch.set(key, []);
      byBatch.get(key).push(s);
    }

    const matchedBatches = [];
    let allBatchesMatched = byBatch.size > 0;
    for (const [key, batchSettlements] of byBatch) {
      const [settlementDate] = key.split("|");
      const netSum = round2(batchSettlements.reduce((sum, s) => sum + s.net_amount, 0));
      const bank = bankTxs.find(
        (bt) =>
          !matchedBankIds.has(bt.id) &&
          bt.type === "credit" &&
          daysDiff(bt.date, settlementDate) <= 1 &&
          Math.abs(bt.amount - netSum) < TOLERANCE
      );
      if (!bank) {
        allBatchesMatched = false;
        break;
      }
      matchedBatches.push({ bank, settlements: batchSettlements, netSum });
    }

    if (!allBatchesMatched) continue; // cadeia não fecha 100% nesta execução — deixa pending

    for (const { bank, settlements: batchSettlements, netSum } of matchedBatches) {
      matchedBankIds.add(bank.id);
      batchSettlements.forEach((s) => matchedAcquirerIds.add(s.id));

      const grossSum = round2(batchSettlements.reduce((sum, s) => sum + s.gross_amount, 0));
      const feeSum = round2(batchSettlements.reduce((sum, s) => sum + (s.fee_amount || 0), 0));
      const brand = batchSettlements[0]?.card_brand || "";

      records.push({
        tenant_id: bank.tenant_id,
        bank_transaction_id: bank.id,
        cash_transaction_id: cash.id,
        cash_transaction_ids: [cash.id],
        acquirer_settlement_ids: batchSettlements.map((s) => s.id),
        reconciliation_date: bank.date,
        status: "reconciled",
        ai_classification: "Receita de cartão (3 pontas)",
        ai_reasoning: `Cadeia fechada aritmeticamente: caixa (R$ ${cash.amount.toFixed(2)}) = soma bruta da maquininha (R$ ${grossSum.toFixed(2)}, ${batchSettlements.length} linha(s)${brand ? `, ${brand}` : ""}); banco (R$ ${bank.amount.toFixed(2)}) = soma líquida da maquininha (R$ ${netSum.toFixed(2)}, taxa total R$ ${feeSum.toFixed(2)}).`,
        matched_by_rule_id: null,
        category: null,
        responsible: "Vendas Cartão",
        cost_center_id: null,
        payment_method: cash.payment_method || "",
        notes: null,
        confidence: 1,
        engine_version: "3way_deterministic_v1",
      });
    }
  }

  // Deriva os sets finais só do que de fato virou registro — evita marcar como
  // "reconciled" um caixa/banco/liquidação que ficou reservado numa cadeia que
  // acabou não fechando.
  const finalBankIds = new Set(records.map((r) => r.bank_transaction_id));
  const finalCashIds = new Set(records.flatMap((r) => r.cash_transaction_ids));
  const finalAcquirerIds = new Set(records.flatMap((r) => r.acquirer_settlement_ids));

  return { records, usedBankIds: finalBankIds, usedCashIds: finalCashIds, usedAcquirerIds: finalAcquirerIds };
}
