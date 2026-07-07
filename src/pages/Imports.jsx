import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { parseOfx } from '@/lib/ofx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/StatusBadge';
import { Landmark, Wallet, Upload, Loader2 } from 'lucide-react';

function UploadCard({ icon: Icon, title, description, accept, sources, onImport, result }) {
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { await onImport(file, sourceId); } finally { setBusy(false); e.target.value = ''; }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={sourceId} onValueChange={setSourceId}>
          <SelectTrigger><SelectValue placeholder="Selecionar fonte do arquivo" /></SelectTrigger>
          <SelectContent>
            {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-8 transition-colors ${sourceId && !busy ? 'cursor-pointer hover:border-primary/60' : 'opacity-50'}`}>
          {busy ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
          <span className="text-sm text-muted-foreground">{busy ? 'Importando...' : 'Clique para selecionar o arquivo'}</span>
          <input type="file" accept={accept} className="hidden" disabled={!sourceId || busy} onChange={handleFile} />
        </label>
        {result && <p className="text-sm text-green-400">{result}</p>}
      </CardContent>
    </Card>
  );
}

export default function Imports() {
  const { tenantId } = useTenant();
  const [sources, setSources] = useState([]);
  const [recent, setRecent] = useState([]);
  const [ofxResult, setOfxResult] = useState('');
  const [cashResult, setCashResult] = useState('');

  const load = useCallback(async () => {
    if (tenantId === 'all') { setSources([]); setRecent([]); return; }
    const [s, b] = await Promise.all([
      base44.entities.TransactionSource.filter({ tenant_id: tenantId }, 'name', 100),
      base44.entities.BankTransaction.filter({ tenant_id: tenantId }, '-imported_at', 10),
    ]);
    setSources(s); setRecent(b);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const importOfx = async (file, sourceId) => {
    const text = await file.text();
    const txns = parseOfx(text);
    if (txns.length === 0) { setOfxResult('Nenhuma transação encontrada no arquivo.'); return; }
    const now = new Date().toISOString();
    await base44.entities.BankTransaction.bulkCreate(
      txns.map((t) => ({ ...t, tenant_id: tenantId, source_id: sourceId, status: 'pending', imported_at: now }))
    );
    setOfxResult(`${txns.length} transações bancárias importadas com sucesso.`);
    load();
  };

  const importCash = async (file, sourceId) => {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Data da transação no formato YYYY-MM-DD' },
            amount: { type: 'number', description: 'Valor da transação' },
            payment_method: { type: 'string', description: 'Forma de pagamento: PIX, Dinheiro, Cartão, etc.' },
            ticket: { type: 'string', description: 'Número do ticket, se houver' },
            description: { type: 'string', description: 'Descrição da transação' },
            operator: { type: 'string', description: 'Operador do caixa, se houver' },
          },
        },
      },
    });
    if (res.status !== 'success' || !res.output) { setCashResult('Erro ao extrair dados: ' + (res.details || 'formato não reconhecido')); return; }
    const rows = Array.isArray(res.output) ? res.output : [res.output];
    const now = new Date().toISOString();
    await base44.entities.CashTransaction.bulkCreate(
      rows.filter((r) => r.date && r.amount).map((r) => ({ ...r, tenant_id: tenantId, source_id: sourceId, status: 'pending', imported_at: now }))
    );
    setCashResult(`${rows.length} transações de caixa importadas com sucesso.`);
    load();
  };

  if (tenantId === 'all') {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">Importações</h2>
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Selecione um cliente específico na barra lateral para importar arquivos.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Importações</h2>
        <p className="text-sm text-muted-foreground">Upload de extratos OFX e fechamentos de caixa</p>
      </div>

      {sources.length === 0 && (
        <Card><CardContent className="py-6 text-center text-sm text-amber-400">Este cliente não possui fontes cadastradas. Cadastre uma fonte na aba Clientes antes de importar.</CardContent></Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <UploadCard icon={Landmark} title="Extrato Bancário (OFX)" description="Arquivo OFX exportado do banco (ex: Stone)" accept=".ofx,.OFX,.txt" sources={sources.filter((s) => s.type === 'ofx')} onImport={importOfx} result={ofxResult} />
        <UploadCard icon={Wallet} title="Fechamento de Caixa" description="Planilha CSV/Excel do caixa físico" accept=".csv,.xlsx,.xls" sources={sources.filter((s) => s.type === 'spreadsheet')} onImport={importCash} result={cashResult} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Últimas transações bancárias importadas</CardTitle></CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-medium ${t.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>R$ {Number(t.amount).toFixed(2).replace('.', ',')}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}