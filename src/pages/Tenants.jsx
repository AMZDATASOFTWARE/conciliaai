import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import TenantForm from "@/components/tenants/TenantForm";
import TenantDetail from "@/components/tenants/TenantDetail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Building2, Plus, Settings2, Pencil, Loader2 } from "lucide-react";

export default function Tenants() {
  const { tenants, refreshTenants } = useTenant();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const save = async (data) => {
    setSaving(true);
    if (editing) {
      await base44.entities.Tenant.update(editing.id, data);
    } else {
      const created = await base44.entities.Tenant.create(data);
      setFormOpen(false);
      setSaving(false);
      setProvisioning(true);
      try {
        const res = await base44.functions.invoke("provisionTenantSquad", { tenantId: created.id });
        toast({ title: "Squad de IA provisionado", description: `Agentes dedicados: ${(res.data.agents || []).join(", ")}` });
      } catch (err) {
        toast({ title: "Erro ao provisionar Squad", description: err.message, variant: "destructive" });
      }
      setProvisioning(false);
      setEditing(null);
      refreshTenants();
      return;
    }
    setSaving(false);
    setFormOpen(false);
    setEditing(null);
    refreshTenants();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes (Tenants)</h1>
          <p className="text-sm text-slate-400 mt-1">Clientes do BPO com isolamento total de dados</p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-blue-600 hover:bg-blue-500">
          <Plus className="w-4 h-4 mr-2" /> Novo cliente
        </Button>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {tenants.length === 0 ? (
          <EmptyState icon={Building2} title="Nenhum cliente cadastrado" description="Crie o primeiro tenant para começar a importar extratos e fechamentos de caixa." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">CNPJ</th>
                <th className="px-5 py-3 font-medium">Banco</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-700/20">
                  <td className="px-5 py-3 font-medium text-slate-200">{t.name}</td>
                  <td className="px-5 py-3 text-slate-400 font-mono text-xs">{t.cnpj || "—"}</td>
                  <td className="px-5 py-3 text-slate-400">{t.bank_name || "—"}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(t)} className="text-slate-400 hover:text-blue-400" title="Centros de custo e fontes">
                        <Settings2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setFormOpen(true); }} className="text-slate-400 hover:text-blue-400" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) { setFormOpen(false); setEditing(null); } }}>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
            <TenantForm initial={editing} onSubmit={save} saving={saving} />
          </DialogContent>
        </Dialog>
      )}

      {provisioning && (
        <Dialog open>
          <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm [&>button]:hidden">
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-sm text-slate-300 font-medium">Provisionando Squad de IA dedicado...</p>
              <p className="text-xs text-slate-500 text-center">Instanciando Analista, Supervisor e Diretor exclusivos deste cliente</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {detail && <TenantDetail open={!!detail} tenant={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}