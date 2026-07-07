import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { parseOFX } from "@/lib/reconcile";
import { parseCSV } from "@/lib/parsers/csv";
import { mapRows } from "@/lib/parsers/dynamicParser";
import ColumnMappingModal from "@/components/imports/ColumnMappingModal";
import { useToast } from "@/components/ui/use-toast";
import { usePaginatedEntity } from "@/hooks/usePaginatedEntity";
import DataPagination from "@/components/DataPagination";
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
  const [pendingCash, setPendingCash] = useState(null); // { rows, headers } aguardando mapeamento

  // Listagens paginadas no servidor (10 por página)
  const query = useMemo(() => (tenantId === "all" ? {} : { tenant_id: tenantId }), [tenantId]);
  const bank = usePaginatedEntity("BankTransaction", query, "-imported_at", 10);
  const cash = usePaginatedEntity("CashTransaction", query, "-imported_at", 10);

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
    bank.reload();
  };

  // Passo 1: lê apenas os cabeçalhos/linhas do arquivo e abre o modal de mapeamento
  const startCashImport = async (file) => {
    if (!file) return;
    setBusy("cash");
    try {
      let rows;
      if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
        rows = parseCSV(await file.text());
      } else {
        // XLS/XLSX: extração preservando todas as colunas originais
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: { type: "array", items: { type: "object", additionalProperties: true } },
        });
        if (res.status !== "success" || !res.output) throw new Error(res.details || "Não foi possível ler a planilha.");
        rows = Array.isArray(res.output) ? res.output : [res.output];
      }
      if (!rows.length) throw new Error("Nenhuma linha de dados encontrada no arquivo.");
      setPendingCash({ rows, headers: Object.keys(rows[0]) });
    } catch (e) {
      toast({ title: "Falha na leitura do arquivo", description: e.message, variant: "destructive" });
    }
    setBusy(null);
  };

  // Passo 2: usuário confirmou o De/Para no modal → salva as CashTransactions
  const confirmCashImport = async (mapping) => {
    const { rows } = pendingCash;
    setPendingCash(null);
    setBusy("cash");
    try {
      const coreMapping = { core_date: mapping.date, core_amount: mapping.amount, core_description: mapping.description };
      const records = mapRows(rows, coreMapping);
      const source = await getOrCreateSource(tenantId, "spreadsheet", "Planilha de Caixa");
      const now = new Date().toISOString();
      await base44.entities.CashTransaction.bulkCreate(
        records.map((r) => ({ ...r, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
      );
      toast({ title: "Planilha importada", description: `${records.length} lançamentos de caixa importados.` });
      cash.reload();
    } catch (e) {
      toast({ title: "Falha na importação", description: e.message, variant: "destructive" });
    }
    setBusy(null);
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
              <p className="text-xs text-slate-500">CSV ou Excel — mapeie as colunas no momento do upload</p>
            </div>
          </div>
          <input ref={cashRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { startCashImport(e.target.files[0]); e.target.value = ""; }} />
          <Button disabled={busy === "cash"} onClick={() => requireTenant() && cashRef.current.click()} className="w-full bg-green-600 hover:bg-green-500">
            <Upload className="w-4 h-4 mr-2" /> {busy === "cash" ? "Lendo arquivo..." : "Enviar planilha de caixa"}
          </Button>
        </div>
      </div>

      <ColumnMappingModal
        isOpen={!!pendingCash}
        onClose={() => setPendingCash(null)}
        fileHeaders={pendingCash?.headers || []}
        onConfirm={confirmCashImport}
      />

      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: "Últimas transações bancárias", pager: bank, empty: "Nenhum OFX importado ainda." },
          { title: "Últimos lançamentos de caixa", pager: cash, empty: "Nenhuma planilha importada ainda." },
        ].map(({ title, pager, empty }) => (
          <div key={title} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">{title}</p>
            {pager.loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
            ) : pager.items.length === 0 ? (
              <EmptyState icon={FileWarning} title={empty} />
            ) : (
              <div className="divide-y divide-slate-700/60">
                {pager.items.map((t) => (
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
            <DataPagination page={pager.page} hasMore={pager.hasMore} onPageChange={pager.setPage} className="border-t border-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}