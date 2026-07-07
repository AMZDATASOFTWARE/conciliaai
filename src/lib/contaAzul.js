// Exportação estrita no formato Conta Azul — 10 colunas oficiais, nesta ordem
export const CONTA_AZUL_HEADERS = [
  'Data de Competência',
  'Data de Vencimento',
  'Data de Pagamento',
  'Valor',
  'Categoria',
  'Descrição',
  'Cliente/Fornecedor',
  'CNPJ/CPF Cliente/Fornecedor',
  'Centro de Custo',
  'Observações',
];

export function formatDateBR(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatValueBR(amount) {
  if (amount === null || amount === undefined) return '';
  return Number(amount).toFixed(2).replace('.', ',');
}

const escape = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// rows: array de arrays com exatamente 10 valores na ordem oficial
export function buildContaAzulCsv(rows) {
  return [
    CONTA_AZUL_HEADERS.join(';'),
    ...rows.map((r) => r.map(escape).join(';')),
  ].join('\n');
}

export function downloadCsv(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}