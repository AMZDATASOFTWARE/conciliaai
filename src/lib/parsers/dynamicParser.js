// Universal Cash Parser (Motor Dinâmico) — mapeia linhas genéricas de CSV/Excel
// para CashTransaction usando o column_mapping configurado na TransactionSource.

export const CORE_FIELDS = {
  core_date: 'date',
  core_amount: 'amount',
  core_description: 'description',
  core_payment_method: 'payment_method',
  core_ticket: 'ticket',
  core_operator: 'operator',
};

export function normalizeDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

export function normalizeAmount(v) {
  if (typeof v === 'number') return isNaN(v) ? null : v;
  if (!v) return null;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Campos do relatório de vendas da maquininha (Fase 3 do plano de precisão cirúrgica).
// Mantém-se separado de CORE_FIELDS/mapRows (caixa) de propósito: os campos e a
// validação são bem diferentes, misturar aumentaria o risco de erro de mapeamento.
export const ACQUIRER_FIELDS = {
  sale_date: { label: "Data da Venda", required: true },
  settlement_date: { label: "Data da Liquidação (depósito)", required: true },
  gross_amount: { label: "Valor Bruto", required: true },
  net_amount: { label: "Valor Líquido", required: true },
  fee_amount: { label: "Taxa", required: false },
  card_brand: { label: "Bandeira", required: false },
  card_type: { label: "Modalidade (débito/crédito/pix)", required: false },
  batch_reference: { label: "Lote / Resumo de Vendas", required: false },
  authorization_code: { label: "NSU / Código de Autorização", required: false },
};

function normalizeCardType(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("pix")) return "pix";
  if (s.includes("parcel") || s.includes("installment")) return "credit_installment";
  if (s.includes("créd") || s.includes("cred")) return "credit";
  if (s.includes("déb") || s.includes("deb")) return "debit";
  return undefined;
}

// rows: array de objetos; mapping: { sale_date, settlement_date, gross_amount, net_amount, fee_amount?, card_brand?, card_type?, batch_reference?, authorization_code? } -> nome da coluna no arquivo
export function mapAcquirerRows(rows, mapping) {
  if (!rows || rows.length === 0) throw new Error("Nenhuma linha de dados encontrada no arquivo.");

  const headers = Object.keys(rows[0]);
  const missing = Object.entries(ACQUIRER_FIELDS)
    .filter(([key, f]) => f.required && (!mapping[key] || !headers.includes(mapping[key])))
    .map(([key, f]) => f.label);
  if (missing.length > 0) {
    throw new Error(`Colunas obrigatórias não mapeadas ou ausentes no arquivo: ${missing.join(", ")}. Colunas encontradas: ${headers.join(", ")}`);
  }

  const records = rows.map((row) => {
    const sale_date = normalizeDate(row[mapping.sale_date]);
    const settlement_date = normalizeDate(row[mapping.settlement_date]);
    const gross_amount = normalizeAmount(row[mapping.gross_amount]);
    const net_amount = normalizeAmount(row[mapping.net_amount]);
    const fee_amount = mapping.fee_amount ? normalizeAmount(row[mapping.fee_amount]) : (gross_amount != null && net_amount != null ? Number((gross_amount - net_amount).toFixed(2)) : null);
    return {
      raw_data: row,
      sale_date,
      settlement_date,
      gross_amount,
      net_amount,
      fee_amount,
      card_brand: mapping.card_brand ? String(row[mapping.card_brand] || "").trim() : "",
      card_type: mapping.card_type ? normalizeCardType(row[mapping.card_type]) : undefined,
      batch_reference: mapping.batch_reference ? String(row[mapping.batch_reference] ?? "").trim() : "",
      authorization_code: mapping.authorization_code ? String(row[mapping.authorization_code] ?? "").trim() : "",
    };
  }).filter((r) => r.sale_date && r.settlement_date && r.gross_amount !== null && r.net_amount !== null);

  if (records.length === 0) {
    throw new Error("Nenhuma linha válida após o mapeamento. Verifique as colunas de datas e valores.");
  }
  return records;
}

// rows: array de objetos keyados pelas colunas originais; mapping: column_mapping da fonte
export function mapRows(rows, mapping) {
  if (!rows || rows.length === 0) throw new Error('Nenhuma linha de dados encontrada no arquivo.');

  const headers = Object.keys(rows[0]);
  const missing = Object.entries(mapping)
    .filter(([key, col]) => CORE_FIELDS[key] && col && !headers.includes(col))
    .map(([, col]) => col);
  if (missing.length > 0) {
    throw new Error(`Colunas ausentes no arquivo: ${missing.join(', ')}. Colunas encontradas: ${headers.join(', ')}`);
  }

  const records = rows.map((row) => {
    const rec = { raw_data: row };
    for (const [key, field] of Object.entries(CORE_FIELDS)) {
      if (mapping[key]) rec[field] = row[mapping[key]];
    }
    rec.date = normalizeDate(rec.date);
    rec.amount = normalizeAmount(rec.amount);
    return rec;
  }).filter((r) => r.date && r.amount !== null && r.amount !== 0);

  if (records.length === 0) {
    throw new Error('Nenhuma linha válida após o mapeamento. Verifique se as colunas de Data e Valor estão corretas.');
  }
  return records;
}