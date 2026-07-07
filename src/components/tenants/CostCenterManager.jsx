import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';

export default function CostCenterManager({ tenantId }) {
  const [items, setItems] = useState([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setItems(await base44.entities.CostCenter.filter({ tenant_id: tenantId }, 'code', 200));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!code || !name) return;
    setSaving(true);
    await base44.entities.CostCenter.create({ tenant_id: tenantId, code, name, is_active: true });
    setCode(''); setName(''); setSaving(false);
    load();
  };

  const toggle = async (item) => {
    await base44.entities.CostCenter.update(item.id, { is_active: item.is_active === false });
    load();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (ex: 002)" className="w-32" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: TDPATIO)" />
        <Button type="submit" size="icon" disabled={saving}><Plus className="w-4 h-4" /></Button>
      </form>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {items.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhum centro de custo cadastrado.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border border-border">
            <span className="text-sm font-medium">{item.code} — {item.name}</span>
            <Switch checked={item.is_active !== false} onCheckedChange={() => toggle(item)} />
          </div>
        ))}
      </div>
    </div>
  );
}