// Leitor de CSV com suporte a aspas e detecção automática de delimitador (; ou ,).
// Retorna array de objetos keyados pelos cabeçalhos originais do arquivo.

export function parseCSV(text) {
  const nl = text.indexOf('\n');
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else { cur += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }

  if (rows.length < 2) throw new Error('Arquivo CSV vazio ou sem linhas de dados.');
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? '').trim()]))
  );
}