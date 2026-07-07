import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { parseOFX } from "@/lib/reconcile";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Landmark, Wallet, Upload, FileWarning } from "lucide-react";

async function getOrCreateSource(tenantId, type, name) {
  const existing = await base44.entities.TransactionSource.filter({ tenant_id: tenantId, type }, "name", 1);
  if (existing.length) return existing[0];
  return base44.entities.TransactionSource.create({ tenant_id: tenantId, type, name });
}

export default function Importacoes() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const ofxRef = useRef();
  const cashRef = useRef();
  const [busy, setBusy] = useState(null);
  const [recent, setRecent] = useState({ bank: [], cash: [] });

  const loadRecent = async () => {
    const q = tenantId === "all" ? {} : { tenant_id: tenantId };
    const [b, c] = await Promise.all([
      base44.entities.BankTransaction.filter(q, "-imported_at", 8),
      base44.entities.CashTransaction.filter(q, "-imported_at", 8),
    ]);
    setRecent({ bank: b, cash: c });
  };

  useEffect(() => { loadRecent(); }, [tenantId]);

  const requireTenant = () => {
    if (tenantId === "all") {
      toast({ title: "Selecione um cliente", description: "Escolha o tenant ativo na barra lateral antes de importar.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const importOFX = async (file) => {
    if (!file) return;
    setBusy("ofx");
    const text = await file.text();
    const txs = parseOFX(text);
    if (txs.length === 0) {
      toast({ title: "Nenhuma transação encontrada", description: "O arquivo não parece ser um OFX válido.", variant: "destructive" });
      setBusy(null);
      return;
    }
    const source = await getOrCreateSource(tenantId, "ofx", `OFX ${file.name.replace(/\.\w+$/, "")}`);
    const now = new Date().toISOString();
    await base44.entities.BankTransaction.bulkCreate(
      txs.map((t) => ({ ...t, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
    );
    toast({ title: "OFX importado", description: `${txs.length} transações bancárias importadas.` });
    setBusy(null);
    loadRecent();
  };

  const importCash = async (file) => {
    if (!file) return;
    setBusy("cash");
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: {
          transactions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "Data no formato YYYY-MM-DD" },
                amount: { type: "number", description: "Valor absoluto" },
                payment_method: { type: "string", description: "PIX, Dinheiro, Cartão etc." },
                ticket: { type: "string" },
                description: { type: "string" },
                operator: { type: "string" },
              },
            },
          },
        },
      },
    });
    const txs = result.status === "success" ? (result.output?.transactions || []) : [];
    if (txs.length === 0) {
      toast({ title: "Falha na extração", description: result.details || "Não foi possível extrair lançamentos da planilha.", variant: "destructive" });
      setBusy(null);
      return;
    }
    const source = await getOrCreateSource(tenantId, "spreadsheet", "Planilha de Caixa");
    const now = new Date().toISOString();
    await base44.entities.CashTransaction.bulkCreate(
      txs.filter((t) => t.date && t.amount).map((t) => ({ ...t, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
    );
    toast({ title: "Planilha importada", description: `${txs.length} lançamentos de caixa importados.` });
    setBusy(null);
    loadRecent();
  };

  const tenantName = tenants.find((t) => t.id === tenantId)?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importações</h1>
        <p className="text-sm text-slate-400 mt-1">
          {tenantId === "all" ? "Selecione um cliente na barra lateral para importar arquivos" : `Importando para: ${tenantName}`}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/15 flex items-center justify-center"><Landmark className="w-4.5 h-4.5 text-blue-400" /></div>
            <div>
              <p className="font-medium text-slate-200">Extrato bancário (OFX)</p>
              <p className="text-xs text-slate-500">Stone, Itaú, e demais bancos</p>
            </div>
          </div>
          <input ref={ofxRef} type="file" accept=".ofx,.qfx,.txt" className="hidden" onChange={(e) => { importOFX(e.target.files[0]); e.target.value = ""; }} />
          <Button disabled={busy === "ofx"} onClick={() => requireTenant() && ofxRef.current.click()} className="w-full bg-blue-600 hover:bg-blue-500">
            <Upload className="w-4 h-4 mr-2" /> {busy === "ofx" ? "Importando..." : "Enviar arquivo OFX"}
          </Button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-600/15 flex items-center justify-center"><Wallet className="w-4.5 h-4.5 text-green-400" /></div>
            <div>
              <p className="font-medium text-slate-200">Fechamento de caixa (planilha)</p>
              <p className="text-xs text-slate-500">Excel, CSV ou PDF — extração automática por IA</p>
            </div>
          </div>
          <input ref={cashRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={(e) => { importCash(e.target.files[0]); e.target.value = ""; }} />
          <Button disabled={busy === "cash"} onClick={() => requireTenant() && cashRef.current.click()} className="w-full bg-green-600 hover:bg-green-500">
            <Upload className="w-4 h-4 mr-2" /> {busy === "cash" ? "Extraindo dados..." : "Enviar planilha de caixa"}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: "Últimas transações bancárias", list: recent.bank, empty: "Nenhum OFX importado ainda." },
          { title: "Últimos lançamentos de caixa", list: recent.cash, empty: "Nenhuma planilha importada ainda." },
        ].map(({ title, list, empty }) => (
          <div key={title} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">{title}</p>
            {list.length === 0 ? (
              <EmptyState icon={FileWarning} title={empty} />
            ) : (
              <div className="divide-y divide-slate-700/60">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-300 truncate">{t.description || t.payment_method || "—"}</p>
                      <p className="text-xs text-slate-500">{t.date}</p>
                    </div>
                    <span className={`tabular-nums shrink-0 ml-4 ${t.type === "debit" ? "text-red-400" : "text-green-400"}`}>
                      {t.amount?.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}