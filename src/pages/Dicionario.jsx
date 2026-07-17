import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/EmptyState";
import RuleForm from "@/components/rules/RuleForm";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Plus, Pencil, Trash2, Check, X, Bot, User } from "lucide-react";

export default function Dicionario() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending_review

  const load = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    const [rls, ccs] = await Promise.all([
      base44.entities.ReconciliationRule.filter(q, "-created_date", 500),
      base44.entities.CostCenter.filter(q, "code", 500),
    ]);
    setRules(rls);
    setCostCenters(ccs);
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); }, [tenantId]);

  const openNew = () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "As regras do dicionário são específicas por tenant.", variant: "destructive" });
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const save = async (data) => {
    // Regras criadas/editadas manualmente por um humano já nascem aprovadas —
    // só as que vem do feedback loop da IA passam por pending_review.
    if (editing) await base44.entities.ReconciliationRule.update(editing.id, { ...data, approval_status: "approved" });
    else await base44.entities.ReconciliationRule.create({ ...data, tenant_id: tenantId, match_count: 0, created_by: "human", approval_status: "approved" });
    setFormOpen(false);
    setEditing(null);
    load();
  };

  const approve = async (r) => {
    await base44.entities.ReconciliationRule.update(r.id, { approval_status: "approved", is_active: true });
    load();
  };

  const reject = async (r) => {
    await base44.entities.ReconciliationRule.update(r.id, { approval_status: "rejected", is_active: false });
    load();
  };

  const ccById = Object.fromEntries(costCenters.map((c) => [c.id, c]));
  const tenantName = (id) => tenants.find((t) => t.id === id)?.name || "—";
  const pendingCount = rules.filter((r) => r.approval_status === "pending_review").length;
  const visibleRules = statusFilter === "pending_review" ? rules.filter((r) => r.approval_status === "pending_review") : rules;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dicionário de Regras</h1>
          <p className="text-sm text-slate-400 mt-1">Regras que o Squad de IA usa para classificar transações</p>
        </div>
        <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-500">
          <Plus className="w-4 h-4 mr-2" /> Nova regra
        </Button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : rules.length === 0 ? (
          <EmptyState icon={BookOpen} title="Nenhuma regra cadastrada" description='Ex: keyword "WILSON DE CASSIO" → Jhennifer, categoria Diárias.' />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="px-5 py-3 font-medium">Palavra-chave</th>
                <th className="px-5 py-3 font-medium">Mapear para</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Centro de custo</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium text-center">PF</th>
                <th className="px-5 py-3 font-medium text-right">Matches</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {rules.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-700/20 ${r.is_active === false ? "opacity-50" : ""}`}>
                  <td className="px-5 py-2.5 font-mono text-xs text-amber-400">{r.keyword}</td>
                  <td className="px-5 py-2.5 text-slate-200">{r.map_to}</td>
                  <td className="px-5 py-2.5 text-slate-400">{r.category || "—"}</td>
                  <td className="px-5 py-2.5 text-slate-400 font-mono text-xs">{ccById[r.cost_center_id] ? `${ccById[r.cost_center_id].code}- ${ccById[r.cost_center_id].name}` : "—"}</td>
                  <td className="px-5 py-2.5 text-slate-400">{tenantName(r.tenant_id)}</td>
                  <td className="px-5 py-2.5 text-center text-slate-400">{r.is_pf ? "Sim" : "Não"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-slate-400">{r.match_count || 0}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setFormOpen(true); }} className="text-slate-400 hover:text-blue-400"><Pencil className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={async () => { await base44.entities.ReconciliationRule.delete(r.id); load(); }} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <RuleForm open={formOpen} rule={editing} costCenters={costCenters.filter((c) => editing ? c.tenant_id === editing.tenant_id : c.tenant_id === tenantId)} onClose={() => { setFormOpen(false); setEditing(null); }} onSave={save} />
      )}
    </div>
  );
}