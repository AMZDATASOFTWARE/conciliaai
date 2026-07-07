import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TenantForm({ initial, onSubmit, saving }) {
  const [data, setData] = useState({
    name: initial?.name || '',
    cnpj: initial?.cnpj || '',
    bank_name: initial?.bank_name || '',
    status: initial?.status || 'active',
    notes: initial?.notes || '',
  });
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(data); }} className="space-y-4">
      <div>
        <Label>Nome *</Label>
        <Input value={data.name} onChange={(e) => set('name', e.target.value)} required placeholder="Ex: The Driver" className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>CNPJ</Label>
          <Input value={data.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" className="mt-1" />
        </div>
        <div>
          <Label>Banco principal</Label>
          <Input value={data.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="Ex: Stone" className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Status</Label>
        <Select value={data.status} onValueChange={(v) => set('status', v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} className="mt-1" rows={2} />
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? 'Salvando...' : 'Salvar Cliente'}</Button>
    </form>
  );
}