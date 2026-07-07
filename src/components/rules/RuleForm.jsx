import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function RuleForm({ initial, costCenters, onSubmit, saving }) {
  const [data, setData] = useState({
    keyword: initial?.keyword || '',
    map_to: initial?.map_to || '',
    category: initial?.category || '',
    cost_center_id: initial?.cost_center_id || '',
    is_pf: initial?.is_pf || false,
    is_active: initial?.is_active !== false,
  });
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(data); }} className="space-y-4">
      <div>
        <Label>Palavra-chave *</Label>
        <Input value={data.keyword} onChange={(e) => set('keyword', e.target.value)} required placeholder="Ex: WILSON DE CASSIO" className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Texto buscado na descrição original da transação bancária.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Mapear para</Label>
          <Input value={data.map_to} onChange={(e) => set('map_to', e.target.value)} placeholder="Ex: Jhennifer" className="mt-1" />
        </div>
        <div>
          <Label>Categoria</Label>
          <Input value={data.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex: Diárias" className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Centro de Custo</Label>
        <Select value={data.cost_center_id || 'none'} onValueChange={(v) => set('cost_center_id', v === 'none' ? '' : v)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum</SelectItem>
            {(costCenters || []).map((cc) => (
              <SelectItem key={cc.id} value={cc.id}>{cc.code} — {cc.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={data.is_pf} onCheckedChange={(v) => set('is_pf', v)} />
          <Label>Pessoa Física (PF)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={data.is_active} onCheckedChange={(v) => set('is_active', v)} />
          <Label>Ativa</Label>
        </div>
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Salvar Regra'}</Button>
    </form>
  );
}