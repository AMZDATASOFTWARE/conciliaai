import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import RuleForm from '@/components/rules/RuleForm';
import { Plus, BookOpen, Pencil, Trash2 } from 'lucide-react';

export default function Rules() {
  const { tenantId } = useTenant();
  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | rule
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (tenantId === 'all') { setRules([]); setCostCenters([]); return; }
    const [r, cc] = await Promise.all([
      base44.entities.ReconciliationRule.filter({ tenant_id: tenantId }, '-created_date', 500),
      base44.entities.CostCenter.filter({ tenant_id: tenantId }, 'code', 200),
    ]);
    setRules(r); setCostCenters(cc);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const save = async (data) => {
    setSaving(true);
    if (editing === 'new') {
      await base44.entities.ReconciliationRule.create({ ...data, tenant_id: tenantId, match_count: 0 });
    } else {
      await base44.entities.ReconciliationRule.update(editing.id, data);
    }
    setSaving(false);
    setEditing(null);
    load();
  };

  const toggle = async (rule) => {
    await base44.entities.ReconciliationRule.update(rule.id, { is_active: rule.is_active === false });
    load();
  };

  const remove = async (rule) => {
    await base44.entities.ReconciliationRule.delete(rule.id);
    load();
  };

  if (tenantId === 'all') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Dicionário de Regras</h2>
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um cliente específico na barra lateral para gerenciar regras.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dicionário de Regras</h2>
          <p className="text-sm text-muted-foreground">Regras que o motor de conciliação e o Squad de IA usam para classificar transações</p>
        </div>
        <Button onClick={() => setEditing('new')}><Plus className="w-4 h-4 mr-2" /> Nova Regra</Button>
      </div>

      {rules.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada para este cliente.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {rules.map((rule) => {
                const cc = costCenters.find((c) => c.id === rule.cost_center_id);
                return (
                  <div key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">"{rule.keyword}" → {rule.map_to || '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {rule.category || 'Sem categoria'} · {cc ? `${cc.code} — ${cc.name}` : 'Sem centro de custo'}{rule.is_pf ? ' · PF' : ''} · {rule.match_count || 0} matches
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={rule.is_active !== false} onCheckedChange={() => toggle(rule)} />
                      <Button variant="ghost" size="icon" onClick={() => setEditing(rule)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(rule)}><Trash2 className="w-4 h-4 text-red-400" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing === 'new' ? 'Nova Regra' : 'Editar Regra'}</DialogTitle></DialogHeader>
          {editing && <RuleForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? null : editing} costCenters={costCenters} onSubmit={save} saving={saving} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}