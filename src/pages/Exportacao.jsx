import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { downloadContaAzulCSV } from "@/lib/contaAzulExportService";
import { fetchAllEntities } from "@/lib/fetchAllEntities";
import { usePaginatedEntity } from "@/hooks/usePaginatedEntity";
import DataPagination from "@/components/DataPagination";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileDown, Download } from "lucide-react";

const COLUMNS = ["Data de Competência", "Data de Vencimento", "Data de Pagamento", "Valor", "Categoria", "Descrição", "Cliente/Fornecedor", "CNPJ/CPF Cliente/Fornecedor", "Centro de Custo", "Observações"];

export default function Exportacao() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [costCenters, setCostCenters] = useState([]);
  const [exporting, setExporting] = useState(false);

  // Filtros aplicados no servidor: tenant, status exportável e período
  const query = useMemo(() => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    q.status = { $in: ["reconciled", "manual"] };
    const range = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    if (Object.keys(range).length) q.reconciliation_date = range;
    return q;
  }, [tenantId, from, to]);

  // Prévia paginada no servidor (50 por página)
  const { items: previewRecords, page, setPage, hasMore, loading, reload } = usePaginatedEntity("ReconciledRecord", query, "-reconciliation_date", 50);

  useEffect(() => {
    (async () => {
      const q = tenantId === "all" ? {} : { tenant_id: tenantId };
      setCostCenters(await base44.entities.CostCenter.filter(q, "code", 500));
    })();
  }, [tenantId]);

  const handleExport = async () => {
    setExporting(true);
    // Exportação busca TODAS as linhas do lote no servidor, em batches de 500
    const all = await fetchAllEntities(base44.entities.ReconciledRecord, query, "-reconciliation_date");
    if (all.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum registro conciliado no período selecionado.", variant: "destructive" });
      setExporting(false);
      return;
    }
    // Populate: cruza cost_center_id -> nome do CostCenter para a coluna "Centro de Custo"
    const ccNameById = Object.fromEntries(costCenters.map((c) => [c.id, c.name]));
    const populated = all.map((r) => ({ ...r, cost_center_name: ccNameById[r.cost_center_id] || "" }));
    const tenantName = tenantId === "all" ? "Todos" : (tenants.find((t) => t.id === tenantId)?.name || "Cliente").replace(/\s+/g, "_");
    const refDate = from || new Date().toISOString().slice(0, 10);
    const mesAno = `${refDate.slice(5, 7)}-${refDate.slice(0, 4)}`;
    downloadContaAzulCSV(populated, `Exportacao_${tenantName}_${mesAno}.csv`);
    const now = new Date().toISOString();
    for (let i = 0; i < all.length; i += 500) {
      await base44.entities.ReconciledRecord.bulkUpdate(all.slice(i, i + 500).map((r) => ({ id: r.id, exported_at: now })));
    }
    toast({ title: "CSV exportado", description: `${all.length} registros no formato estrito Conta Azul (10 colunas).` });
    setExporting(false);
    reload();
  };

  const ccById = Object.fromEntries(costCenters.map((c) => [c.id, c]));

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
          <p className="text-xs text-slate-500 mb-1.5">Registros Conciliados e Manuais do período</p>
          <Button onClick={handleExport} disabled={exporting} className="bg-green-600 hover:bg-green-500">
            <Download className="w-4 h-4 mr-2" /> {exporting ? "Exportando lote completo..." : "Exportar Lote para Conta Azul"}
          </Button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">Pré-visualização — página {page} ({previewRecords.length} linhas exibidas)</p>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : previewRecords.length === 0 ? (
          <EmptyState icon={FileDown} title="Nenhum registro conciliado para exportar" description="Apenas registros com status Conciliado ou Manual entram no arquivo." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700">
                  {COLUMNS.map((c) => <th key={c} className="px-4 py-2.5 font-medium whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {previewRecords.map((r) => {
                  const d = r.reconciliation_date ? r.reconciliation_date.split("-").reverse().join("/") : "";
                  const cc = ccById[r.cost_center_id];
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className="px-4 py-2 text-slate-400 whitespace-nowrap">{d}</td>
                      <td className={`px-4 py-2 tabular-nums ${r.amount < 0 ? "text-red-400" : "text-green-400"}`}>{typeof r.amount === "number" ? r.amount.toFixed(2).replace(".", ",") : ""}</td>
                      <td className="px-4 py-2 text-slate-300">{r.category || ""}</td>
                      <td className="px-4 py-2 text-slate-300 max-w-[200px] truncate">{r.description || ""}</td>
                      <td className="px-4 py-2 text-slate-300">{r.responsible || ""}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono">{r.cnpj_cpf || ""}</td>
                      <td className="px-4 py-2 text-slate-400 font-mono whitespace-nowrap">{cc ? `${cc.code}- ${cc.name}` : ""}</td>
                      <td className="px-4 py-2 text-slate-400 max-w-[160px] truncate">{r.notes || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DataPagination page={page} hasMore={hasMore} onPageChange={setPage} className="border-t border-slate-700" />
      </div>
    </div>
  );
}