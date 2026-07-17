import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { runReconciliation } from "@/lib/reconcile";
import { run3WayReconciliation } from "@/lib/reconcile3way";
import { useToast } from "@/components/ui/use-toast";
import { usePaginatedEntity } from "@/hooks/usePaginatedEntity";
import DataPagination from "@/components/DataPagination";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import RecordDetail from "@/components/conciliacao/RecordDetail";
import RecordReviewDialog from "@/components/reconciliation/RecordReviewDialog";
import AuditReportDialog from "@/components/conciliacao/AuditReportDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitMerge, Play, Eye, Check, AlertTriangle, Sparkles, Brain, Pencil, Lock, CreditCard } from "lucide-react";

export default function Conciliacao() {
  const { tenantId } = useTenant();
  const { toast } = useToast();
  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [running, setRunning] = useState(false);
  const [threeWayRunning, setThreeWayRunning] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [review, setReview] = useState(null);

  // Paginação no servidor: 100 registros por página, filtros de tenant e status na query
  const query = useMemo(() => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    if (statusFilter !== "all") q.status = statusFilter;
    return q;
  }, [tenantId, statusFilter]);
  const { items: records, page, setPage, hasMore, loading, reload } = usePaginatedEntity("ReconciledRecord", query, "-reconciliation_date", 100);

  const loadLookups = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    const [rls, ccs] = await Promise.all([
      base44.entities.ReconciliationRule.filter(q, "-created_date", 500),
      base44.entities.CostCenter.filter(q, "code", 500),
    ]);
    setRules(rls);
    setCostCenters(ccs);
  };

  useEffect(() => { loadLookups(); }, [tenantId]);

  const run = async () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "Escolha o tenant ativo na barra lateral para executar a conciliação.", variant: "destructive" });
      return;
    }
    setRunning(true);
    const [bankTxsRaw, cashTxs, tenantRules] = await Promise.all([
      base44.entities.BankTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 500),
      base44.entities.CashTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 500),
      base44.entities.ReconciliationRule.filter({ tenant_id: tenantId, is_active: true }, "-created_date", 500),
    ]);
    // Idempotência: não reprocessa transações que já têm um ReconciledRecord ativo
    // (não-divergente) — evita duplicar registros se alguém rodar duas vezes seguidas.
    const bankTxs = bankTxsRaw.length
      ? await (async () => {
          const existing = await base44.entities.ReconciledRecord.filter(
            { tenant_id: tenantId, bank_transaction_id: { $in: bankTxsRaw.map((t) => t.id) }, status: { $ne: "divergent" } },
            "-created_date",
            bankTxsRaw.length
          );
          const resolved = new Set(existing.map((r) => r.bank_transaction_id));
          return bankTxsRaw.filter((t) => !resolved.has(t.id));
        })()
      : bankTxsRaw;
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
    loadLookups();
    reload();
  };

  const runThreeWay = async () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "Escolha o tenant ativo na barra lateral para executar a conciliação.", variant: "destructive" });
      return;
    }
    setThreeWayRunning(true);
    const [bankTxsRaw, cashTxsRaw, acquirerRaw] = await Promise.all([
      base44.entities.BankTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 5000),
      base44.entities.CashTransaction.filter({ tenant_id: tenantId, status: "pending" }, "date", 5000),
      base44.entities.AcquirerSettlement.filter({ tenant_id: tenantId, status: "pending" }, "sale_date", 5000),
    ]);
    if (acquirerRaw.length === 0) {
      toast({ title: "Nada a conciliar", description: "Não há relatório de maquininha pendente para este cliente — importe um na tela de Importações primeiro." });
      setThreeWayRunning(false);
      return;
    }
    // Idempotência: não reprocessa transações bancárias que já têm ReconciledRecord ativo
    const existingActive = bankTxsRaw.length
      ? await base44.entities.ReconciledRecord.filter(
          { tenant_id: tenantId, bank_transaction_id: { $in: bankTxsRaw.map((t) => t.id) }, status: { $ne: "divergent" } },
          "-created_date",
          bankTxsRaw.length
        )
      : [];
    const resolvedBankIds = new Set(existingActive.map((r) => r.bank_transaction_id));
    const bankTxs = bankTxsRaw.filter((t) => !resolvedBankIds.has(t.id));

    const { records: newRecords, usedBankIds, usedCashIds, usedAcquirerIds } = run3WayReconciliation({
      bankTxs,
      cashTxs: cashTxsRaw,
      acquirerSettlements: acquirerRaw,
    });

    if (newRecords.length > 0) {
      await base44.entities.ReconciledRecord.bulkCreate(newRecords);
      await base44.entities.BankTransaction.bulkUpdate([...usedBankIds].map((id) => ({ id, status: "reconciled" })));
      await base44.entities.CashTransaction.bulkUpdate([...usedCashIds].map((id) => ({ id, status: "reconciled" })));
      await base44.entities.AcquirerSettlement.bulkUpdate([...usedAcquirerIds].map((id) => ({ id, status: "reconciled" })));
    }
    toast({
      title: newRecords.length ? "Conciliação Maquininha concluída" : "Nenhuma cadeia fechou",
      description: newRecords.length
        ? `${newRecords.length} depósito(s) bancário(s) conciliado(s) via caixa → maquininha → banco.`
        : "Nenhuma cadeia caixa→maquininha→banco fechou 100% nesta rodada — os pendentes seguem para revisão (regras ou Squad de IA).",
    });
    setThreeWayRunning(false);
    reload();
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
      reload();
    } catch (err) {
      toast({ title: "Erro no Squad IA", description: err.message, variant: "destructive" });
    }
    setAiRunning(false);
  };

  const setStatus = async (rec, status) => {
    if (rec.locked) {
      toast({ title: "Registro travado", description: "Já foi exportado para a Conta Azul. Use \"Reabrir Conciliação\" para editar.", variant: "destructive" });
      return;
    }
    await base44.entities.ReconciledRecord.update(rec.id, { status });
    setDetail(null);
    reload();
  };

  const handleReviewSave = async (rec, data) => {
    if (rec.locked) {
      toast({ title: "Registro travado", description: "Já foi exportado para a Conta Azul. Use \"Reabrir Conciliação\" para editar.", variant: "destructive" });
      return;
    }
    await base44.entities.ReconciledRecord.update(rec.id, data);
    setReview(null);
    reload();
  };

  const reopenRecord = async (rec) => {
    if (rec.locked) {
      toast({ title: "Não é possível reabrir", description: "Este registro já foi exportado para a Conta Azul e está travado.", variant: "destructive" });
      return;
    }
    await base44.entities.ReconciledRecord.update(rec.id, { status: "pending" });
    if (rec.bank_transaction_id) await base44.entities.BankTransaction.update(rec.bank_transaction_id, { status: "pending" });
    // Reabre TODOS os lançamentos de caixa envolvidos (não só o primeiro) e as
    // liquidações de maquininha da cadeia, quando existirem (motor de 3 pontas).
    const cashIds = rec.cash_transaction_ids?.length ? rec.cash_transaction_ids : (rec.cash_transaction_id ? [rec.cash_transaction_id] : []);
    await Promise.all(cashIds.map((id) => base44.entities.CashTransaction.update(id, { status: "pending" })));
    if (rec.acquirer_settlement_ids?.length) {
      await Promise.all(rec.acquirer_settlement_ids.map((id) => base44.entities.AcquirerSettlement.update(id, { status: "pending" })));
    }
    toast({ title: "Conciliação reaberta", description: "O lançamento voltou a ficar pendente e pode ser reprocessado." });
    setDetail(null);
    reload();
  };

  const rulesById = Object.fromEntries(rules.map((r) => [r.id, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Conciliação</h1>
          <p className="text-sm text-slate-400 mt-1">Revisão dos registros conciliados com rastreabilidade da IA</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={run} disabled={running || threeWayRunning || aiRunning} variant="outline" className="border-slate-600" title="Só concilia lançamentos cujo dicionário reconhece a descrição — nunca por coincidência de valor">
            <Play className="w-4 h-4 mr-2" /> {running ? "Conciliando..." : "Conciliação por Dicionário (regras)"}
          </Button>
          <Button onClick={runThreeWay} disabled={running || threeWayRunning || aiRunning} className="bg-purple-600 hover:bg-purple-500" title="Match matemático exato: caixa → relatório da maquininha → banco. Só concilia quando a cadeia inteira fecha.">
            <CreditCard className="w-4 h-4 mr-2" /> {threeWayRunning ? "Conciliando (3 pontas)..." : "Conciliação Maquininha (3 pontas)"}
          </Button>
          <Button onClick={runAiSquad} disabled={running || threeWayRunning || aiRunning} className="bg-blue-600 hover:bg-blue-500">
            <Sparkles className="w-4 h-4 mr-2" /> {aiRunning ? "Squad em execução (Analista → Supervisor → Diretor)..." : "Executar Conciliação IA (Squad Hierárquico)"}
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-slate-800">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="reconciled">Conciliados</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="divergent">Divergentes</TabsTrigger>
          <TabsTrigger value="manual">Manuais</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
        ) : records.length === 0 ? (
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
              {records.map((r) => (
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
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      {r.locked && <Lock className="w-3 h-3 text-slate-500" aria-label="Travado (exportado)" />}
                    </div>
                  </td>
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
        <DataPagination page={page} hasMore={hasMore} onPageChange={setPage} className="border-t border-slate-700" />
      </div>

      {detail && (
        <RecordDetail record={detail} rule={rulesById[detail.matched_by_rule_id]} onClose={() => setDetail(null)} onSetStatus={setStatus} onReopen={reopenRecord} />
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