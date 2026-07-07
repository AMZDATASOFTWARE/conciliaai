import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import { Landmark, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const { tenants, tenantId } = useTenant();
  const [bank, setBank] = useState([]);
  const [cash, setCash] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    setLoading(true);
    Promise.all([
      base44.entities.BankTransaction.filter(q, "-date", 500),
      base44.entities.CashTransaction.filter(q, "-date", 500),
      base44.entities.ReconciledRecord.filter(q, "-reconciliation_date", 500),
    ]).then(([b, c, r]) => {
      setBank(b); setCash(c); setRecords(r); setLoading(false);
    });
  }, [tenantId]);

  const count = (list, s) => list.filter((r) => r.status === s).length;
  const total = records.length;
  const reconciled = count(records, "reconciled") + count(records, "manual");
  const pending = count(records, "pending");
  const divergent = count(records, "divergent");
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const tenantName = (id) => tenants.find((t) => t.id === id)?.name || "—";

  if (loading) {
    return <div className="flex justify-center py-24"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          {tenantId === "all" ? "Visão geral de todos os clientes" : `Cliente: ${tenantName(tenantId)}`}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Landmark} label="Transações bancárias" value={bank.length} sub={`${count(bank, "pending")} pendentes de conciliação`} />
        <StatCard icon={Wallet} label="Lançamentos de caixa" value={cash.length} sub={`${count(cash, "pending")} pendentes de conciliação`} />
        <StatCard icon={CheckCircle2} label="Conciliados" value={`${pct(reconciled)}%`} sub={`${reconciled} de ${total} registros`} accent="text-green-400" />
        <StatCard icon={AlertTriangle} label="Pendentes / Divergentes" value={pending + divergent} sub={`${pct(pending)}% pendentes · ${pct(divergent)}% divergentes`} accent="text-amber-400" />
      </div>

      {total > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <p className="text-sm font-medium text-slate-300 mb-3">Distribuição da conciliação</p>
          <div className="h-3 rounded-full overflow-hidden flex bg-slate-700">
            <div className="bg-green-500" style={{ width: `${pct(reconciled)}%` }} />
            <div className="bg-amber-500" style={{ width: `${pct(pending)}%` }} />
            <div className="bg-red-500" style={{ width: `${pct(divergent)}%` }} />
          </div>
          <div className="flex gap-6 mt-3 text-xs text-slate-400">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />Conciliados ({reconciled})</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />Pendentes ({pending})</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />Divergentes ({divergent})</span>
          </div>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <p className="text-sm font-medium text-slate-300">Últimos registros conciliados</p>
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-slate-500 px-5 py-10 text-center">Nenhum registro de conciliação ainda. Importe arquivos e execute a conciliação.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="px-5 py-2.5 font-medium">Data</th>
                <th className="px-5 py-2.5 font-medium">Cliente</th>
                <th className="px-5 py-2.5 font-medium">Descrição</th>
                <th className="px-5 py-2.5 font-medium text-right">Valor</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {records.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap">{r.reconciliation_date}</td>
                  <td className="px-5 py-2.5 text-slate-300">{tenantName(r.tenant_id)}</td>
                  <td className="px-5 py-2.5 text-slate-300 max-w-xs truncate">{r.description}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums ${r.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                    {typeof r.amount === "number" ? r.amount.toFixed(2).replace(".", ",") : "—"}
                  </td>
                  <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}