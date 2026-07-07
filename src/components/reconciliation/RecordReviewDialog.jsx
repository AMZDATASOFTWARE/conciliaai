import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { Sparkles } from 'lucide-react';

export default function RecordReviewDialog({ record, bankTxn, rule, costCenters, onSave, onClose }) {
  const [data, setData] = useState({
    category: record?.category || '',
    responsible: record?.responsible || '',
    document: record?.document || '',
    cost_center_id: record?.cost_center_id || '',
    payment_method: record?.payment_method || '',
    notes: record?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));

  const save = async (status) => {
    setSaving(true);
    await onSave(record, { ...data, status });
    setSaving(false);
  };

  if (!record) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Revisar Conciliação <StatusBadge status={record.status} /></DialogTitle>
        </DialogHeader>

        {bankTxn && (
          <div className="bg-background rounded-lg p-3 border border-border text-sm space-y-1">
            <p className="font-medium">{bankTxn.description}</p>
            <p className="text-muted-foreground">{bankTxn.date} · <span className={bankTxn.amount < 0 ? 'text-red-400' : 'text-green-400'}>R$ {Number(bankTxn.amount).toFixed(2).replace('.', ',')}</span></p>
          </div>
        )}

        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-primary"><Sparkles className="w-3.5 h-3.5" /> Raciocínio da IA</p>
          <p className="text-muted-foreground">{record.ai_reasoning || 'Sem raciocínio registrado.'}</p>
          {rule && <p className="text-xs text-muted-foreground pt-1">Regra utilizada: <span className="font-medium text-foreground">"{rule.keyword}"</span></p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Categoria</Label><Input value={data.category} onChange={(e) => set('category', e.target.value)} className="mt-1" /></div>
          <div><Label>Cliente/Fornecedor</Label><Input value={data.responsible} onChange={(e) => set('responsible', e.target.value)} className="mt-1" /></div>
          <div><Label>CNPJ/CPF</Label><Input value={data.document} onChange={(e) => set('document', e.target.value)} className="mt-1" /></div>
          <div><Label>Forma de Pagamento</Label><Input value={data.payment_method} onChange={(e) => set('payment_method', e.target.value)} placeholder="PIX, Cartão..." className="mt-1" /></div>
        </div>
        <div>
          <Label>Centro de Custo</Label>
          <Select value={data.cost_center_id || 'none'} onValueChange={(v) => set('cost_center_id', v === 'none' ? '' : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {(costCenters || []).map((cc) => <SelectItem key={cc.id} value={cc.id}>{cc.code} — {cc.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Observações</Label><Textarea value={data.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className="mt-1" /></div>

        <div className="flex gap-2 pt-2">
          <Button onClick={() => save('reconciled')} disabled={saving} className="flex-1 bg-success hover:bg-success/90 text-white">Aprovar</Button>
          <Button onClick={() => save('manual')} disabled={saving} variant="secondary" className="flex-1">Salvar Manual</Button>
          <Button onClick={() => save('divergent')} disabled={saving} variant="destructive" className="flex-1">Divergente</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}