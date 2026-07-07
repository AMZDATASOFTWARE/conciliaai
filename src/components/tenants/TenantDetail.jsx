import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import SquadManager from "@/components/tenants/SquadManager";

export default function TenantDetail({ tenant, open, onClose }) {
  const [costCenters, setCostCenters] = useState([]);
  const [sources, setSources] = useState([]);
  const [cc, setCc] = useState({ code: "", name: "" });
  const [src, setSrc] = useState({ name: "", type: "ofx", bank_name: "" });

  const load = async () => {
    const [ccs, srcs] = await Promise.all([
      base44.entities.CostCenter.filter({ tenant_id: tenant.id }, "code", 200),
      base44.entities.TransactionSource.filter({ tenant_id: tenant.id }, "name", 200),
    ]);
    setCostCenters(ccs);
    setSources(srcs);
  };

  useEffect(() => { if (open && tenant) load(); }, [open, tenant?.id]);

  const addCC = async (e) => {
    e.preventDefault();
    await base44.entities.CostCenter.create({ tenant_id: tenant.id, code: cc.code, name: cc.name, is_active: true });
    setCc({ code: "", name: "" });
    load();
  };

  const addSrc = async (e) => {
    e.preventDefault();
    await base44.entities.TransactionSource.create({ tenant_id: tenant.id, ...src });
    setSrc({ name: "", type: "ofx", bank_name: "" });
    load();
  };

  const TYPE_LABEL = { ofx: "OFX", spreadsheet: "Planilha", api: "API" };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tenant?.name} — Configurações</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="cc">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="cc">Centros de Custo</TabsTrigger>
            <TabsTrigger value="src">Fontes de Transação</TabsTrigger>
            <TabsTrigger value="squad">Squad IA</TabsTrigger>
          </TabsList>
          <TabsContent value="cc" className="space-y-3 mt-4">
            <form onSubmit={addCC} className="flex gap-2">
              <Input required value={cc.code} onChange={(e) => setCc({ ...cc, code: e.target.value })} placeholder="Código (ex: 002)" className="bg-slate-800 border-slate-700 w-36" />
              <Input required value={cc.name} onChange={(e) => setCc({ ...cc, name: e.target.value })} placeholder="Nome (ex: TDPATIO)" className="bg-slate-800 border-slate-700" />
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500 shrink-0">Adicionar</Button>
            </form>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
              {costCenters.length === 0 && <p className="text-sm text-slate-500 p-4">Nenhum centro de custo cadastrado.</p>}
              {costCenters.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono text-slate-300">{c.code}- {c.name}</span>
                  <button onClick={async () => { await base44.entities.CostCenter.delete(c.id); load(); }} className="text-slate-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="src" className="space-y-3 mt-4">
            <form onSubmit={addSrc} className="flex gap-2">
              <Input required value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} placeholder="Nome (ex: OFX Stone)" className="bg-slate-800 border-slate-700" />
              <Select value={src.type} onValueChange={(v) => setSrc({ ...src, type: v })}>
                <SelectTrigger className="bg-slate-800 border-slate-700 w-36"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectItem value="ofx">OFX</SelectItem>
                  <SelectItem value="spreadsheet">Planilha</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-500 shrink-0">Adicionar</Button>
            </form>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
              {sources.length === 0 && <p className="text-sm text-slate-500 p-4">Nenhuma fonte cadastrada.</p>}
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-300">{s.name} <span className="text-slate-500 text-xs ml-2">{TYPE_LABEL[s.type]}</span></span>
                  <button onClick={async () => { await base44.entities.TransactionSource.delete(s.id); load(); }} className="text-slate-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="squad" className="mt-4">
            <SquadManager tenantId={tenant.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}