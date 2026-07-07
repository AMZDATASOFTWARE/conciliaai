import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { matchRule, buildReasoning } from '@/lib/reconcile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StatusBadge from '@/components/StatusBadge';
import RecordReviewDialog from '@/components/reconciliation/RecordReviewDialog';
import { Play, Loader2 } from 'lucide-react';

export default function Reconciliation() {
  const { tenantId } = useTenant();
  const [records, setRecords] = useState([]);
  const [bankMap, setBankMap] = useState({});
  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [pendingBankCount, setPendingBankCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [running, setRunning] = useState(false);
  const [reviewing, setReviewing] = useState(null);

  const load = useCallback(async () => {
    if (tenantId === 'all') return;
    const [recs, bank, ruls, ccs] = await Promise.all([
      base44.entities.ReconciledRecord.filter({ tenant_id: tenantId }, '-created_date', 1000),
      base44.entities.BankTransaction.filter({ tenant_id: tenantId }, '-date', 1000),
      base44.entities.ReconciliationRule.filter({ tenant_id: tenantId }, '-created_date', 500),
      base44.entities.CostCenter.filter({ tenant_id: tenantId }, 'code', 200),
    ]);
    setRecords(recs);
    setBankMap(Object.fromEntries(bank.map((t) => [t.id, t])));
    setPendingBankCount(bank.filter((t) => t.status === 'pending').length);
    setRules(ruls);
    setCostCenters(ccs);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const runReconciliation = async () => {
    setRunning(true);
    const pending = Object.values(bankMap).filter((t) => t.status === 'pending');
    const today = new Date().toISOString().slice(0, 10);
    const newRecords = [];
    const txnUpdates = [];
    const ruleHits = {};

    for (const txn of pending) {
      const rule = matchRule(txn.description, rules);
      newRecords.push({
        tenant_id: tenantId,
        bank_transaction_id: txn.id,
        reconciliation_date: today,
        status: rule ? 'reconciled' : 'pending',
        ai_classification: rule ? rule.category || '' : '',
        ai_reasoning: buildReasoning(rule, txn.description),
        matched_by_rule_id: rule ? rule.id : '',
        category: rule ? rule.category || '' : '',
        responsible: rule ? rule.map_to || '' : '',
        cost_center_id: rule ? rule.cost_center_id || '' : '',
      });
      txnUpdates.push({ id: txn.id, status: rule ? 'reconciled' : 'pending' });
      if (rule) ruleHits[rule.id] = (ruleHits[rule.id] || 0) + 1;
    }

    if (newRecords.length > 0) {
      await base44.entities.ReconciledRecord.bulkCreate(newRecords);
      await base44.entities.BankTransaction.bulkUpdate(txnUpdates.filter((u) => u.status === 'reconciled'));
      const ruleUpdates = Object.entries(ruleHits).map(([id, hits]) => {
        const rule = rules.find((r) => r.id === id);
        return { id, match_count: (rule?.match_count || 0) + hits };
      });
      if (ruleUpdates.length > 0) await base44.entities.ReconciliationRule.bulkUpdate(ruleUpdates);
    }
    setRunning(false);
    load();
  };

  const saveReview = async (record, data) => {
    await base44.entities.ReconciledRecord.update(record.id, data);
    if (record.bank_transaction_id && (data.status === 'reconciled' || data.status === 'divergent')) {
      await base44.entities.BankTransaction.update(record.bank_transaction_id, { status: data.status });
    }
    setReviewing(null);
    load();
  };

  if (tenantId === 'all') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Conciliação</h2>
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um cliente específico na barra lateral para conciliar.</CardContent></Card>
      </div>
    );
  }

  const filtered = filter === 'all' ? records : records.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Conciliação</h2>
          <p className="text-sm text-muted-foreground">{pendingBankCount} transações bancárias aguardando conciliação · {rules.length} regras no dicionário</p>
        </div>
        <Button onClick={runReconciliation} disabled={running || pendingBankCount === 0}>
          {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
          Executar Conciliação
        </Button>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">Todos ({records.length})</TabsTrigger>
          <TabsTrigger value="reconciled">Conciliados ({records.filter((r) => r.status === 'reconciled').length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({records.filter((r) => r.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="divergent">Divergentes ({records.filter((r) => r.status === 'divergent').length})</TabsTrigger>
          <TabsTrigger value="manual">Manuais ({records.filter((r) => r.status === 'manual').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nenhum registro. Importe um OFX e execute a conciliação.</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => {
                const txn = bankMap[r.bank_transaction_id];
                return (
                  <button key={r.id} onClick={() => setReviewing(r)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{txn?.description || 'Transação não encontrada'}</p>
                      <p className="text-xs text-muted-foreground">{txn?.date} · {r.category || 'Sem categoria'} · {r.responsible || 'Sem responsável'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {txn && <span className={`text-sm font-medium ${txn.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>R$ {Number(txn.amount).toFixed(2).replace('.', ',')}</span>}
                      <StatusBadge status={r.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {reviewing && (
        <RecordReviewDialog
          record={reviewing}
          bankTxn={bankMap[reviewing.bank_transaction_id]}
          rule={rules.find((r) => r.id === reviewing.matched_by_rule_id)}
          costCenters={costCenters}
          onSave={saveReview}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}