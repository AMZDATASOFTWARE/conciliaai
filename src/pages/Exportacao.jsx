import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { downloadContaAzulCSV } from "@/lib/contaAzulExportService";
import DataPagination from "@/components/DataPagination";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Download } from "lucide-react";

const COLUMNS = ["Data de Competência", "Data de Vencimento", "Data de Pagamento", "Valor", "Categoria", "Descrição", "Cliente/Fornecedor", "CNPJ/CPF Cliente/Fornecedor", "Centro de Custo", "Observações"];
const PAGE_SIZE = 100;

export default function Exportacao() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };

    // Busca todas as coleções necessárias com limite estendido para garantir a carga
    const [recs, ccs, bankTxns, cashTxns] = await Promise.all([
      base44.entities.ReconciledRecord.filter(q, "-reconciliation_date", 5000),
      base44.entities.CostCenter.filter(q, "code", 500),
      base44.entities.BankTransaction.filter(q, "-date", 5000),
      base44.entities.CashTransaction.filter(q, "-date", 5000),
    ]);

    // Dicionários para busca rápida de O(1)
    const bankMap = Object.fromEntries(bankTxns.map((b) => [b.id, b]));
    const cashMap = Object.fromEntries(cashTxns.map((c) => [c.id, c]));
    const ccMap = Object.fromEntries(ccs.map((c) => [c.id, c]));

    // Enriquecimento dos dados (Merge) puxando da fonte original
    const populated = recs.map((r) => {
      const bank = bankMap[r.bank_transaction_id];
      const cash = cashMap[r.cash_transaction_id];
      return {
        ...r,
        cost_center_name: ccMap[r.cost_center_id]?.name || "",
        original_description: bank?.description || cash?.description || "",
        original_amount: bank?.amount ?? cash?.amount ?? 0,
        original_date: bank?.date || cash?.date || r.reconciliation_date,
      };
    });

    // Não reexporta por padrão o que já foi exportado antes (exported_at preenchido)
    // — reexportar sem querer duplicaria lançamentos na Conta Azul.
    setRecords(populated.filter((r) => (r.status === "reconciled" || r.status === "manual") && !r.exported_at));
    setCostCenters(ccs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);
  useEffect(() => { setPage(1); }, [tenantId, from, to]);

  // Filtro de período sobre a data original da transação
  const filtered = useMemo(() => records.filter((r) => {
    const d = r.original_date || r.reconciliation_date || "";
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [records, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRecords = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = async () => {
    if (filtered.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum registro conciliado no período selecionado.", variant: "destructive" });
      return;
    }
    setExporting(true);
    const tenantName = tenantId === "all" ? "Todos" : (tenants.find((t) => t.id === tenantId)?.name || "Cliente").replace(/\s+/g, "_");
    const refDate = from || filtered[0]?.original_date || new Date().toISOString().slice(0, 10);
    const mesAno = `${refDate.slice(5, 7)}-${refDate.slice(0, 4)}`;
    downloadContaAzulCSV(filtered, `Exportacao_${tenantName}_${mesAno}.csv`);
    const now = new Date().toISOString();
    for (let i = 0; i < filtered.length; i += 500) {
      await base44.entities.ReconciledRecord.bulkUpdate(filtered.slice(i, i + 500).map((r) => ({ id: r.id, exported_at: now, locked: true })));
    }
    toast({ title: "CSV exportado", description: `${filtered.length} registros no formato estrito Conta Azul (10 colunas).` });
    setExporting(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exportação Conta Azul</h1>
        <p className="text-sm text-slate-400 mt-1">Formato estrito: 10 colunas oficiais, saídas com valor negativo</p>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-slate-300 text-xs">De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900 border-slate-700 mt-1 w-44" />
        </div>
        <div>
          <Label className="text-slate-300 text-xs">Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900 border-slate-700 mt-1 w-44" />
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <p className="text-xs text-slate-500 mb-1.5">{filtered.length} registros conciliados/manuais no período</p>
          <Button onClick={handleExport} disabled={exporting || loading} className="bg-green-600 hover:bg-green-500">
            <Download className="w-4 h-4 mr-2" /> {exporting ? "Exportando lote completo..." : "Exportar Lote para Conta Azul"}
          </Button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">
          Pré-visualização — página {page} de {totalPages} ({filtered.length} registros)
        </p>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : pageRecords.length === 0 ? (
          <EmptyState icon={FileDown} title="Nenhum registro conciliado para exportar" description="Apenas registros com status Conciliado ou Manual, ainda não exportados, entram no arquivo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  {COLUMNS.map((c) => <th key={c} className="px-4 py-2.5 font-medium whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {pageRecords.map((r) => {
                  const iso = r.original_date || r.reconciliation_date || "";
                  const d = iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
                  const amount = r.original_amount;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className={`px-4 py-2 tabular-nums ${amount < 0 ? "text-red-400" : "text-green-400"}`}>{typeof amount === "number" ? amount.toFixed(2).replace(".", ",") : ""}</td>
                      <td className="px-4 py-2 text-slate-300">{r.category || ""}</td>
                      <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate">{r.original_description || r.description || ""}</td>
                      <td className="px-4 py-2 text-slate-300">{r.responsible || ""}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{r.document || ""}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono whitespace-nowrap">{r.cost_center_name || ""}</td>
                      <td className="px-4 py-2 text-slate-400 max-w-[160px] truncate">{r.notes || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DataPagination page={page} hasMore={page < totalPages} onPageChange={setPage} className="border-t border-slate-700" />
      </div>
    </div>
  );
}