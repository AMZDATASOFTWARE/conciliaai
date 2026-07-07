import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Bot, Loader2 } from "lucide-react";

const ROLE_LABEL = {
  analista: "Analista Financeiro (Nível Base)",
  supervisor: "Supervisor de BPO (Nível Médio)",
  diretor: "Diretor Financeiro (Nível Alto)",
};

export default function SquadManager({ tenantId }) {
  const { toast } = useToast();
  const [agents, setAgents] = useState(null);
  const [provisioning, setProvisioning] = useState(false);

  const load = async () => setAgents(await base44.entities.TenantAgent.filter({ tenant_id: tenantId }, "created_date"));
  useEffect(() => { load(); }, [tenantId]);

  const provision = async () => {
    setProvisioning(true);
    try {
      await base44.functions.invoke("provisionTenantSquad", { tenantId });
      await load();
    } catch (err) {
      toast({ title: "Erro ao provisionar Squad", description: err.message, variant: "destructive" });
    }
    setProvisioning(false);
  };

  if (!agents) return <p className="text-sm text-slate-500 p-4">Carregando squad...</p>;

  if (agents.length === 0) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-sm text-slate-400">Nenhum squad provisionado para este cliente.</p>
        <Button onClick={provision} disabled={provisioning} className="bg-blue-600 hover:bg-blue-500">
          {provisioning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bot className="w-4 h-4 mr-2" />}
          Provisionar Squad de IA dedicado
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agents.map((a) => (
        <div key={a.id} className="border border-slate-800 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-blue-400" /> {ROLE_LABEL[a.role] || a.role}
            </p>
            <span className="text-xs text-green-400">{a.status === "active" ? "Ativo" : a.status}</span>
          </div>
          <p className="font-mono text-xs text-slate-500 mt-1">{a.agent_name}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {(a.skills || []).map((s) => (
              <span key={s} className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-slate-400">{s}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}