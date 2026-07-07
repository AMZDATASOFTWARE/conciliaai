import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';

const TYPE_LABELS = { ofx: 'OFX', spreadsheet: 'Planilha', api: 'API' };

export default function SourceManager({ tenantId }) {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('ofx');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setItems(await base44.entities.TransactionSource.filter({ tenant_id: tenantId }, 'name', 100));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!name) return;
    setSaving(true);
    await base44.entities.TransactionSource.create({ tenant_id: tenantId, name, type });
    setName(''); setSaving(false);
    load();
  };

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (ex: OFX Stone)" />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ofx">OFX</SelectItem>
            <SelectItem value="spreadsheet">Planilha</SelectItem>
            <SelectItem value="api">API</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="icon" disabled={saving}><Plus className="w-4 h-4" /></Button>
      </form>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {items.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma fonte cadastrada.</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between bg-background rounded-lg px-3 py-2 border border-border">
            <span className="text-sm font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground bg-accent px-2 py-0.5 rounded">{TYPE_LABELS[item.type] || item.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}