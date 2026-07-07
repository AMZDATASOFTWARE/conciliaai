import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Memory() {
  const { tenantId } = useTenant();
  const [items, setItems] = useState([]);
  const [content, setContent] = useState('');
  const [contextType, setContextType] = useState('text');
  const [sourceDescription, setSourceDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (tenantId === 'all') { setItems([]); return; }
    setItems(await base44.entities.TenantMemoryContext.filter({ tenant_id: tenantId }, '-created_date', 200));
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.entities.TenantMemoryContext.create({
      tenant_id: tenantId,
      context_type: contextType,
      content,
      source_description: sourceDescription,
    });
    setContent(''); setSourceDescription(''); setSaving(false);
    load();
  };

  const remove = async (item) => {
    await base44.entities.TenantMemoryContext.delete(item.id);
    load();
  };

  if (tenantId === 'all') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Memória Contextual</h2>
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um cliente específico na barra lateral para gerenciar a memória contextual.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Memória Contextual</h2>
        <p className="text-sm text-muted-foreground">Base de conhecimento (RAG) que o Squad de Agentes de IA consulta antes de conciliar — resumos, transcrições e diretrizes do cliente</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Adicionar contexto</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={contextType} onValueChange={setContextType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="file_reference">Referência de arquivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Origem</Label>
                <Input value={sourceDescription} onChange={(e) => setSourceDescription(e.target.value)} placeholder="Ex: áudio WhatsApp, reunião" className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={3} placeholder="Diretriz, resumo ou transcrição do cliente..." className="mt-1" />
            </div>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Adicionar à Memória'}</Button>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Brain className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum contexto salvo ainda para este cliente.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {item.source_description || 'Origem não informada'} · {item.context_type === 'file_reference' ? 'Arquivo' : 'Texto'} · {item.created_date ? format(new Date(item.created_date), 'dd/MM/yyyy HH:mm') : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(item)} className="shrink-0"><Trash2 className="w-4 h-4 text-red-400" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}