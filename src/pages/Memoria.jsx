import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Plus, Trash2, FileText, Paperclip } from "lucide-react";

export default function Memoria() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ context_type: "text", content: "", source_description: "" });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    setItems(await base44.entities.TenantMemoryContext.filter(q, "-created_date", 200));
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); }, [tenantId]);

  const add = async (e) => {
    e.preventDefault();
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "A memória contextual é específica por tenant.", variant: "destructive" });
      return;
    }
    setSaving(true);
    await base44.entities.TenantMemoryContext.create({ ...form, tenant_id: tenantId });
    setForm({ context_type: "text", content: "", source_description: "" });
    setSaving(false);
    load();
  };

  const tenantName = (id) => tenants.find((t) => t.id === id)?.name || "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Memória Contextual</h1>
        <p className="text-sm text-slate-400 mt-1">Base de conhecimento (RAG) que o Agente Diretor Administrativo consulta antes de conciliar — resumos, transcrições de áudios do WhatsApp e diretrizes do cliente</p>
      </div>

      <form onSubmit={add} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <Select value={form.context_type} onValueChange={(v) => setForm({ ...form, context_type: v })}>
            <SelectTrigger className="bg-slate-900 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
              <SelectItem value="text">Texto (resumo / diretriz / transcrição)</SelectItem>
              <SelectItem value="file_reference">Referência de arquivo</SelectItem>
            </SelectContent>
          </Select>
          <Input value={form.source_description} onChange={(e) => setForm({ ...form, source_description: e.target.value })} placeholder="Origem (ex: áudio WhatsApp 05/07, reunião mensal)" className="bg-slate-900 border-slate-700" />
        </div>
        <Textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Conteúdo do contexto: diretrizes de conciliação, resumos de conversas, transcrições..." rows={3} className="bg-slate-900 border-slate-700" />
        <div className="flex justify-end">
          <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-500">
            <Plus className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Adicionar contexto"}
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl">
            <EmptyState icon={Brain} title="Nenhum contexto salvo" description="O Squad de Agentes de IA usará estes contextos como memória por cliente." />
          </div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/15 flex items-center justify-center shrink-0">
                {m.context_type === "text" ? <FileText className="w-4 h-4 text-blue-400" /> : <Paperclip className="w-4 h-4 text-blue-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-slate-300 font-medium">{tenantName(m.tenant_id)}</span>
                  {m.source_description && <span>· {m.source_description}</span>}
                  <span>· {m.created_date?.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{m.content}</p>
              </div>
              <button onClick={async () => { await base44.entities.TenantMemoryContext.delete(m.id); load(); }} className="text-slate-500 hover:text-red-400 shrink-0 self-start">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}