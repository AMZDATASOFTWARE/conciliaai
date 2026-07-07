// Motor de exportação estrito Conta Azul:
// 10 colunas oficiais, delimitador ponto-e-vírgula, UTF-8 com BOM.
export const CONTA_AZUL_HEADER = [
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

export function formatDateBR(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Mantém o sinal negativo das saídas; vírgula como separador decimal
export function formatValueBR(amount) {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "";
  return Number(amount).toFixed(2).replace(".", ",");
}

const escapeCell = (v) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// records: ReconciledRecords já populados com `cost_center_name` (nome, não ID)
export function generateContaAzulCSV(records) {
  const rows = records.map((r) => {
    const date = formatDateBR(r.reconciliation_date);
    return [
      date, // Data de Competência
      date, // Data de Vencimento
      date, // Data de Pagamento
      formatValueBR(r.amount),
      r.category || "",
      r.description || "",
      r.responsible || r.map_to || "",
      "", // CNPJ/CPF em branco por padrão
      r.cost_center_name || "",
      r.notes || r.ai_reasoning || r.payment_method || "",
    ].map(escapeCell).join(";");
  });

  const csvContent = "\uFEFF" + [CONTA_AZUL_HEADER.join(";"), ...rows].join("\n");
  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
}

export function downloadContaAzulCSV(records, filename) {
  const blob = generateContaAzulCSV(records);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}