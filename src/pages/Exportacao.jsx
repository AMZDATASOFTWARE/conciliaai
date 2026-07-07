import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { buildContaAzulCSV } from "@/lib/reconcile";
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
  const [records, setRecords] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    const [recs, ccs] = await Promise.all([
      base44.entities.ReconciledRecord.filter(q, "-reconciliation_date", 1000),
      base44.entities.CostCenter.filter(q, "code", 500),
    ]);
    setRecords(recs.filter((r) => r.status === "reconciled" || r.status === "manual"));
    setCostCenters(ccs);
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); }, [tenantId]);

  const filtered = records.filter((r) => {
    if (from && r.reconciliation_date < from) return false;
    if (to && r.reconciliation_date > to) return false;
    return true;
  });

  const exportCSV = async () => {
    if (filtered.length === 0) {
      toast({ title: "Nada a exportar", description: "Nenhum registro conciliado no período selecionado.", variant: "destructive" });
      return;
    }
    const ccById = Object.fromEntries(costCenters.map((c) => [c.id, c]));
    const csv = buildContaAzulCSV(filtered, ccById);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = tenantId === "all" ? "todos" : (tenants.find((t) => t.id === tenantId)?.name || "cliente").toLowerCase().replace(/\s+/g, "-");
    a.href = url;
    a.download = `conta-azul-${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    await base44.entities.ReconciledRecord.bulkUpdate(filtered.map((r) => ({ id: r.id, exported_at: now })));
    toast({ title: "CSV exportado", description: `${filtered.length} registros no formato estrito Conta Azul (10 colunas).` });
    load();
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
          <p className="text-xs text-slate-500 mb-1.5">{filtered.length} registros prontos para exportar</p>
          <Button onClick={exportCSV} className="bg-green-600 hover:bg-green-500">
            <Download className="w-4 h-4 mr-2" /> Exportar CSV Conta Azul
          </Button>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">Pré-visualização ({filtered.length} linhas)</p>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
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
                {filtered.slice(0, 20).map((r) => {
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
      </div>
    </div>
  );
}