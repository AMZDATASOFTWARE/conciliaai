import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { CONTA_AZUL_HEADERS, buildContaAzulCsv, downloadCsv, formatDateBR, formatValueBR } from '@/lib/contaAzul';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileDown } from 'lucide-react';

export default function ExportPage() {
  const { tenantId, activeTenant } = useTenant();
  const [records, setRecords] = useState([]);
  const [bankMap, setBankMap] = useState({});
  const [ccMap, setCcMap] = useState({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (tenantId === 'all') return;
    const [recs, bank, ccs] = await Promise.all([
      base44.entities.ReconciledRecord.filter({ tenant_id: tenantId }, '-created_date', 1000),
      base44.entities.BankTransaction.filter({ tenant_id: tenantId }, '-date', 1000),
      base44.entities.CostCenter.filter({ tenant_id: tenantId }, 'code', 200),
    ]);
    setRecords(recs.filter((r) => r.status === 'reconciled' || r.status === 'manual'));
    setBankMap(Object.fromEntries(bank.map((t) => [t.id, t])));
    setCcMap(Object.fromEntries(ccs.map((c) => [c.id, `${c.code} — ${c.name}`])));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const inRange = (r) => {
    const txn = bankMap[r.bank_transaction_id];
    const d = txn?.date || r.reconciliation_date || '';
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };

  const filtered = records.filter(inRange);

  const toRow = (r) => {
    const txn = bankMap[r.bank_transaction_id];
    const date = formatDateBR(txn?.date || r.reconciliation_date);
    return [
      date,                                          // Data de Competência
      date,                                          // Data de Vencimento
      date,                                          // Data de Pagamento
      formatValueBR(txn?.amount),                    // Valor (saídas negativas)
      r.category || '',                              // Categoria
      txn?.description || '',                        // Descrição
      r.responsible || '',                           // Cliente/Fornecedor
      r.document || '',                              // CNPJ/CPF Cliente/Fornecedor
      ccMap[r.cost_center_id] || '',                 // Centro de Custo
      r.notes || '',                                 // Observações
    ];
  };

  const exportCsv = async () => {
    setExporting(true);
    const csv = buildContaAzulCsv(filtered.map(toRow));
    const name = `conta_azul_${(activeTenant?.name || 'export').replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(csv, name);
    await base44.entities.ReconciledRecord.bulkUpdate(
      filtered.map((r) => ({ id: r.id, exported_at: new Date().toISOString() }))
    );
    setExporting(false);
    load();
  };

  if (tenantId === 'all') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Exportação Conta Azul</h2>
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um cliente específico na barra lateral para exportar.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Exportação Conta Azul</h2>
          <p className="text-sm text-muted-foreground">Formato estrito com as 10 colunas oficiais · apenas registros conciliados e manuais</p>
        </div>
        <Button onClick={exportCsv} disabled={exporting || filtered.length === 0}>
          <FileDown className="w-4 h-4 mr-2" /> Exportar CSV ({filtered.length})
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex gap-4 items-end">
          <div>
            <Label>Data inicial</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Data final</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pré-visualização ({filtered.length} registros)</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum registro conciliado no período selecionado.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {CONTA_AZUL_HEADERS.map((h) => (
                    <th key={h} className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    {toRow(r).map((cell, i) => (
                      <td key={i} className={`px-3 py-2 whitespace-nowrap max-w-[200px] truncate ${i === 3 && String(cell).startsWith('-') ? 'text-red-400' : ''}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}