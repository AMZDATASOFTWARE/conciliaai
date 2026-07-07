import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { runReconciliation } from "@/lib/reconcile";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import RecordDetail from "@/components/conciliacao/RecordDetail";
import RecordReviewDialog from "@/components/reconciliation/RecordReviewDialog";
import AuditReportDialog from "@/components/conciliacao/AuditReportDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitMerge, Play, Eye, Check, AlertTriangle, Sparkles, Brain, Pencil } from "lucide-react";

export default function Conciliacao() {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const [records, setRecords] = useState([]);
  const [rules, setRules] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [running, setRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [review, setReview] = useState(null);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    const [recs, rls, ccs] = await Promise.all([
      base44.entities.ReconciledRecord.filter(q, "-reconciliation_date", 500),
      base44.entities.ReconciliationRule.filter(tenantId === "all" ? {} : { tenant_id: tenantId }, "-created_date", 500),
      base44.entities.CostCenter.filter(q, "code", 500),
    ]);
    setRecords(recs);
    setRules(rls);
    setCostCenters(ccs);
    setLoading(false);
  };

  useEffect(() => { setLoading(true); load(); }, [tenantId]);

  const run = async () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "Escolha o tenant ativo na barra lateral para executar a conciliação.", variant: "destructive" });
      return;
    }
    setRunning(true);
    const [bankTxs, cashTxs, tenantRules] = await Promise.all([
      base44.entities.BankTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 500),
      base44.entities.CashTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 500),
      base44.entities.ReconciliationRule.filter({ tenant_id: tenantId, is_active: true }, "-created_date", 500),
    ]);
    if (bankTxs.length === 0 && cashTxs.length === 0) {
      toast({ title: "Nada a conciliar", description: "Não há transações pendentes para este cliente." });
      setRunning(false);
      return;
    }
    const { records: newRecords, usedCash, ruleHits } = runReconciliation({ bankTxs, cashTxs, rules: tenantRules });
    await base44.entities.ReconciledRecord.bulkCreate(newRecords);
    if (bankTxs.length) {
      await base44.entities.BankTransaction.bulkUpdate(
        bankTxs.map((bt) => {
          const rec = newRecords.find((r) => r.bank_transaction_id === bt.id);
          return { id: bt.id, status: rec?.status === "reconciled" ? "reconciled" : "divergent" };
        })
      );
    }
    if (cashTxs.length) {
      await base44.entities.CashTransaction.bulkUpdate(
        cashTxs.map((ct) => ({ id: ct.id, status: usedCash.has(ct.id) ? "reconciled" : "divergent" }))
      );
    }
    const hitUpdates = Object.entries(ruleHits).map(([id, hits]) => {
      const rule = tenantRules.find((r) => r.id === id);
      return { id, match_count: (rule?.match_count || 0) + hits };
    });
    if (hitUpdates.length) await base44.entities.ReconciliationRule.bulkUpdate(hitUpdates);
    toast({ title: "Conciliação concluída", description: `${newRecords.length} registros gerados.` });
    setRunning(false);
    load();
  };

  const runAiSquad = async () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "O Squad de IA é isolado por cliente. Escolha o tenant ativo na barra lateral.", variant: "destructive" });
      return;
    }
    setAiRunning(true);
    try {
      const response = await base44.functions.invoke("runAiReconciliation", { tenantId });
      if (response.data.error) throw new Error(response.data.error);
      setAuditResult(response.data);
      toast({ title: "Squad IA concluído", description: `${response.data.reconciled} conciliadas, ${response.data.divergent} divergentes.` });
      load();
    } catch (err) {
      toast({ title: "Erro no Squad IA", description: err.message, variant: "destructive" });
    }
    setAiRunning(false);
  };

  const setStatus = async (rec, status) => {
    await base44.entities.ReconciledRecord.update(rec.id, { status });
    setDetail(null);
    load();
  };

  const handleReviewSave = async (rec, data) => {
    await base44.entities.ReconciledRecord.update(rec.id, data);
    setReview(null);
    load();
  };

  const filtered = statusFilter === "all" ? records : records.filter((r) => r.status === statusFilter);
  const rulesById = Object.fromEntries(rules.map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliação</h1>
          <p className="text-sm text-slate-400 mt-1">Revisão dos registros conciliados com rastreabilidade da IA</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={running || aiRunning} variant="outline" className="border-slate-600">
            <Play className="w-4 h-4 mr-2" /> {running ? "Conciliando..." : "Conciliação por regras"}
          </Button>
          <Button onClick={runAiSquad} disabled={running || aiRunning} className="bg-blue-600 hover:bg-blue-500">
            <Sparkles className="w-4 h-4 mr-2" /> {aiRunning ? "Squad em execução (Analista → Supervisor → Diretor)..." : "Executar Conciliação IA (Squad Hierárquico)"}
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="all">Todos ({records.length})</TabsTrigger>
          <TabsTrigger value="reconciled">Conciliados ({records.filter((r) => r.status === "reconciled").length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({records.filter((r) => r.status === "pending").length})</TabsTrigger>
          <TabsTrigger value="divergent">Divergentes ({records.filter((r) => r.status === "divergent").length})</TabsTrigger>
          <TabsTrigger value="manual">Manuais ({records.filter((r) => r.status === "manual").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={GitMerge} title="Nenhum registro" description="Importe arquivos e execute a conciliação para gerar registros." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Descrição original</th>
                <th className="px-5 py-3 font-medium text-right">Valor</th>
                <th className="px-5 py-3 font-medium">Categoria</th>
                <th className="px-5 py-3 font-medium">Responsável</th>
                <th className="px-5 py-3 font-medium">Raciocínio IA</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-700/20">
                  <td className="px-5 py-2.5 text-slate-400 whitespace-nowrap">{r.reconciliation_date}</td>
                  <td className="px-5 py-2.5 text-slate-300 max-w-[240px] truncate">{r.description}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums ${r.amount < 0 ? "text-red-400" : "text-green-400"}`}>
                    {typeof r.amount === "number" ? r.amount.toFixed(2).replace(".", ",") : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-slate-400">{r.category || "—"}</td>
                  <td className="px-5 py-2.5 text-slate-400">{r.responsible || "—"}</td>
                  <td className="px-5 py-2.5 max-w-[220px]">
                    {r.ai_reasoning ? (
                      <span className="flex items-center gap-1.5 text-xs text-blue-300/80 cursor-help" title={r.ai_reasoning}>
                        <Brain className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                        <span className="truncate">{r.ai_reasoning}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-5 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetail(r)} className="text-slate-400 hover:text-blue-400" title="Ver raciocínio da IA">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setReview(r)} className="text-slate-400 hover:text-amber-400" title="Corrigir / revisar (a IA aprende com a correção)">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {r.status !== "reconciled" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(r, "manual")} className="text-slate-400 hover:text-green-400" title="Aprovar manualmente">
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      {r.status !== "divergent" && (
                        <Button size="sm" variant="ghost" onClick={() => setStatus(r, "divergent")} className="text-slate-400 hover:text-red-400" title="Marcar divergente">
                          <AlertTriangle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <RecordDetail record={detail} rule={rulesById[detail.matched_by_rule_id]} onClose={() => setDetail(null)} onSetStatus={setStatus} />
      )}

      {review && (
        <RecordReviewDialog
          record={review}
          rule={rulesById[review.matched_by_rule_id]}
          costCenters={costCenters}
          onSave={handleReviewSave}
          onClose={() => setReview(null)}
        />
      )}

      <AuditReportDialog open={!!auditResult} onOpenChange={(o) => !o && setAuditResult(null)} result={auditResult} />
    </div>
  );
}