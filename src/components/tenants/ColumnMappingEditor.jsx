import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FIELDS = [
  { key: 'core_date', label: 'Data *', placeholder: 'ex: Data Fechamento' },
  { key: 'core_amount', label: 'Valor *', placeholder: 'ex: Valor Total' },
  { key: 'core_description', label: 'Descrição', placeholder: 'ex: Observações' },
  { key: 'core_payment_method', label: 'Forma de Pagamento', placeholder: 'ex: Forma Pgto' },
  { key: 'core_ticket', label: 'Ticket/Número', placeholder: 'ex: Ticket' },
  { key: 'core_operator', label: 'Operador', placeholder: 'ex: Operador' },
];

export default function ColumnMappingEditor({ source, onSaved }) {
  const [mapping, setMapping] = useState(source.column_mapping || {});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v && v.trim()));
    await base44.entities.TransactionSource.update(source.id, { column_mapping: clean });
    setSaving(false);
    onSaved?.();
  };

  return (
    <div className="bg-accent/40 rounded-lg p-3 space-y-2 border border-border">
      <p className="text-xs text-muted-foreground">
        De/Para: informe o nome exato da coluna no arquivo deste cliente para cada campo do sistema.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium">{f.label}</label>
            <Input
              className="h-8 text-sm"
              value={mapping[f.key] || ''}
              placeholder={f.placeholder}
              onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={save} disabled={saving || !mapping.core_date || !mapping.core_amount}>
        {saving ? 'Salvando...' : 'Salvar mapeamento'}
      </Button>
    </div>
  );
}