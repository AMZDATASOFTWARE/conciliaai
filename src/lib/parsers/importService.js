// Serviço de ingestão: orquestra parsing + persistência, sempre vinculando tenant_id e source_id.
import { base44 } from '@/api/base44Client';
import { parseOfxFile } from './ofxParser';
import { parseCSV } from './csv';
import { mapRows } from './dynamicParser';

// Anti-duplicidade: retorna o conjunto de FITIDs já existentes para o tenant
async function findExistingFitids(tenantId, fitids) {
  const existing = new Set();
  for (let i = 0; i < fitids.length; i += 100) {
    const chunk = fitids.slice(i, i + 100);
    const found = await base44.entities.BankTransaction.filter(
      { tenant_id: tenantId, transaction_id_ofx: { $in: chunk } }, '-created_date', 500
    );
    found.forEach((f) => existing.add(f.transaction_id_ofx));
  }
  return existing;
}

export async function importOfxFile({ file, tenantId, sourceId }) {
  const text = await file.text();
  const txns = parseOfxFile(text);

  const fitids = txns.map((t) => t.transaction_id_ofx).filter(Boolean);
  const existing = fitids.length > 0 ? await findExistingFitids(tenantId, fitids) : new Set();
  const fresh = txns.filter((t) => !t.transaction_id_ofx || !existing.has(t.transaction_id_ofx));

  if (fresh.length > 0) {
    const now = new Date().toISOString();
    await base44.entities.BankTransaction.bulkCreate(
      fresh.map((t) => ({ ...t, tenant_id: tenantId, source_id: sourceId, status: 'pending', imported_at: now }))
    );
  }
  return { imported: fresh.length, duplicates: txns.length - fresh.length };
}

export async function importCashFile({ file, tenantId, sourceId }) {
  const source = await base44.entities.TransactionSource.get(sourceId);
  const mapping = source?.column_mapping;
  if (!mapping || !mapping.core_date || !mapping.core_amount) {
    throw new Error('Esta fonte não possui mapeamento de colunas configurado. Configure o De/Para (Data e Valor são obrigatórios) na aba Clientes.');
  }

  let rows;
  if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
    rows = parseCSV(await file.text());
  } else {
    // XLSX/XLS: extração via integração, preservando todas as colunas originais
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    });
    if (res.status !== 'success' || !res.output) {
      throw new Error('Não foi possível ler a planilha: ' + (res.details || 'formato não reconhecido'));
    }
    rows = Array.isArray(res.output) ? res.output : [res.output];
  }

  const records = mapRows(rows, mapping);
  const now = new Date().toISOString();
  await base44.entities.CashTransaction.bulkCreate(
    records.map((r) => ({ ...r, tenant_id: tenantId, source_id: sourceId, status: 'pending', imported_at: now }))
  );
  return { imported: records.length, skipped: rows.length - records.length };
}