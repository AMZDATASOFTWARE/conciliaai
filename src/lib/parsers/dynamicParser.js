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