import React, { useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTenant } from "@/lib/TenantContext";
import { parseOFX } from "@/lib/reconcile";
import { parseCSV } from "@/lib/parsers/csv";
import { mapRows, mapAcquirerRows, ACQUIRER_FIELDS } from "@/lib/parsers/dynamicParser";
import ColumnMappingModal from "@/components/imports/ColumnMappingModal";
import { useToast } from "@/components/ui/use-toast";
import { usePaginatedEntity } from "@/hooks/usePaginatedEntity";
import DataPagination from "@/components/DataPagination";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Landmark, Wallet, Upload, FileWarning, CreditCard } from "lucide-react";

const ACQUIRER_MODAL_FIELDS = Object.entries(ACQUIRER_FIELDS).map(([key, f]) => ({ key, ...f }));

async function getOrCreateSource(tenantId, type, name) {
  const existing = await base44.entities.TransactionSource.filter({ tenant_id: tenantId, type }, "name", 1);
  if (existing.length) return existing[0];
  return base44.entities.TransactionSource.create({ tenant_id: tenantId, type, name });
}

// Dedup de OFX: reimportar o mesmo extrato não pode duplicar lançamentos.
// Busca em lotes de 100 (limite prático de $in) os FITIDs já existentes pro tenant.
async function findExistingFitids(tenantId, fitids) {
  const existing = new Set();
  for (let i = 0; i < fitids.length; i += 100) {
    const chunk = fitids.slice(i, i + 100);
    const found = await base44.entities.BankTransaction.filter(
      { tenant_id: tenantId, transaction_id_ofx: { $in: chunk } }, "-created_date", 500
    );
    found.forEach((f) => existing.add(f.transaction_id_ofx));
  }
  return existing;
}

// Dedup de caixa: não tem FITID, então usa uma chave composta de conteúdo
// (data+valor+forma de pagamento+descrição) contra o que já existe no range de
// datas do arquivo sendo importado.
const cashKey = (r) => `${r.date}|${r.amount}|${r.payment_method || ""}|${r.description || ""}`;

async function findExistingCashKeys(tenantId, records) {
  const dates = records.map((r) => r.date).filter(Boolean).sort();
  if (!dates.length) return new Set();
  const existing = await base44.entities.CashTransaction.filter(
    { tenant_id: tenantId, date: { $gte: dates[0], $lte: dates[dates.length - 1] } }, "date", 5000
  );
  return new Set(existing.map(cashKey));
}

// Dedup do relatório de maquininha: chave composta usando os campos que
// identificam uma linha única de venda/lote.
const acquirerKey = (r) => `${r.sale_date}|${r.settlement_date}|${r.card_brand || ""}|${r.gross_amount}|${r.batch_reference || ""}`;

async function findExistingAcquirerKeys(tenantId, records) {
  const dates = records.map((r) => r.sale_date).filter(Boolean).sort();
  if (!dates.length) return new Set();
  const existing = await base44.entities.AcquirerSettlement.filter(
    { tenant_id: tenantId, sale_date: { $gte: dates[0], $lte: dates[dates.length - 1] } }, "sale_date", 5000
  );
  return new Set(existing.map(acquirerKey));
}

// Lê só os cabeçalhos/linhas de um arquivo CSV/XLSX — compartilhado entre o
// fluxo de importação de caixa e o de maquininha (mesma mecânica de leitura,
// só o mapeamento de colunas final é diferente).
async function readFileHeadersOrRows(file) {
  if (file.name.toLowerCase().endsWith(".xls")) {
    throw new Error("O formato .xls (Excel antigo) não é suportado. Salve a planilha como .xlsx ou CSV e tente novamente.");
  }
  if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") {
    const rows = parseCSV(await file.text());
    if (!rows.length) throw new Error("Nenhuma linha de dados encontrada no arquivo.");
    return { rows, headers: Object.keys(rows[0]) };
  }
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: "Liste exatamente os nomes das colunas (cabeçalhos da primeira linha) desta planilha, na ordem em que aparecem, sem alterar a grafia.",
    file_urls: [file_url],
    response_json_schema: { type: "object", properties: { headers: { type: "array", items: { type: "string" } } } },
  });
  const headers = res?.headers || [];
  if (!headers.length) throw new Error("Não foi possível identificar os cabeçalhos da planilha.");
  return { fileUrl: file_url, headers };
}

async function extractRowsFromFile(pending) {
  if (pending.rows) return pending.rows;
  const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
    file_url: pending.fileUrl,
    json_schema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "object", properties: Object.fromEntries(pending.headers.map((h) => [h, { type: "string" }])) },
        },
      },
    },
  });
  if (res.status !== "success" || !res.output) throw new Error(res.details || "Não foi possível extrair os dados da planilha.");
  const rows = res.output.rows || (Array.isArray(res.output) ? res.output : []);
  if (!rows.length) throw new Error("Nenhuma linha de dados extraída da planilha.");
  return rows;
}

export default function Importacoes() {
  const { tenantId, tenants } = useTenant();
  const { toast } = useToast();
  const ofxRef = useRef();
  const cashRef = useRef();
  const acquirerRef = useRef();
  const [busy, setBusy] = useState(null);
  const [pendingCash, setPendingCash] = useState(null); // { rows, headers } aguardando mapeamento
  const [pendingAcquirer, setPendingAcquirer] = useState(null); // { rows, headers } aguardando mapeamento

  // Listagens paginadas no servidor (10 por página)
  const query = useMemo(() => (tenantId === "all" ? {} : { tenant_id: tenantId }), [tenantId]);
  const bank = usePaginatedEntity("BankTransaction", query, "-imported_at", 10);
  const cash = usePaginatedEntity("CashTransaction", query, "-imported_at", 10);
  const acquirer = usePaginatedEntity("AcquirerSettlement", query, "-imported_at", 10);

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
    const fitids = txs.map((t) => t.transaction_id_ofx).filter(Boolean);
    const existingFitids = fitids.length ? await findExistingFitids(tenantId, fitids) : new Set();
    const fresh = txs.filter((t) => !t.transaction_id_ofx || !existingFitids.has(t.transaction_id_ofx));
    const duplicateCount = txs.length - fresh.length;

    if (fresh.length > 0) {
      const source = await getOrCreateSource(tenantId, "ofx", `OFX ${file.name.replace(/\.\w+$/, "")}`);
      const now = new Date().toISOString();
      await base44.entities.BankTransaction.bulkCreate(
        fresh.map((t) => ({ ...t, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
      );
    }
    toast({
      title: fresh.length ? "OFX importado" : "Nada de novo",
      description: `${fresh.length} novas, ${duplicateCount} já existiam (ignoradas).`,
    });
    setBusy(null);
    bank.reload();
  };

  // Passo 1: lê apenas os cabeçalhos/linhas do arquivo e abre o modal de mapeamento
  const startCashImport = async (file) => {
    if (!file) return;
    setBusy("cash");
    try {
      setPendingCash(await readFileHeadersOrRows(file));
    } catch (e) {
      toast({ title: "Falha na leitura do arquivo", description: e.message, variant: "destructive" });
    }
    setBusy(null);
  };

  // Passo 2: usuário confirmou o De/Para no modal → salva as CashTransactions
  const confirmCashImport = async (mapping) => {
    const pending = pendingCash;
    setPendingCash(null);
    setBusy("cash");
    try {
      const rows = await extractRowsFromFile(pending);
      const coreMapping = { core_date: mapping.date, core_amount: mapping.amount, core_description: mapping.description };
      const records = mapRows(rows, coreMapping);
      const existingKeys = await findExistingCashKeys(tenantId, records);
      const fresh = records.filter((r) => !existingKeys.has(cashKey(r)));
      const duplicateCount = records.length - fresh.length;

      if (fresh.length > 0) {
        const source = await getOrCreateSource(tenantId, "spreadsheet", "Planilha de Caixa");
        const now = new Date().toISOString();
        await base44.entities.CashTransaction.bulkCreate(
          fresh.map((r) => ({ ...r, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
        );
      }
      toast({
        title: fresh.length ? "Planilha importada" : "Nada de novo",
        description: `${fresh.length} novos, ${duplicateCount} já existiam (ignorados).`,
      });
      cash.reload();
    } catch (e) {
      toast({ title: "Falha na importação", description: e.message, variant: "destructive" });
    }
    setBusy(null);
  };

  // Relatório de vendas da maquininha (Stone/Ton/Cielo/Rede) — mesma mecânica de
  // leitura/mapeamento do caixa, mas mapeado para AcquirerSettlement (Fase 3).
  const startAcquirerImport = async (file) => {
    if (!file) return;
    setBusy("acquirer");
    try {
      setPendingAcquirer(await readFileHeadersOrRows(file));
    } catch (e) {
      toast({ title: "Falha na leitura do arquivo", description: e.message, variant: "destructive" });
    }
    setBusy(null);
  };

  const confirmAcquirerImport = async (mapping) => {
    const pending = pendingAcquirer;
    setPendingAcquirer(null);
    setBusy("acquirer");
    try {
      const rows = await extractRowsFromFile(pending);
      const records = mapAcquirerRows(rows, mapping);
      const existingKeys = await findExistingAcquirerKeys(tenantId, records);
      const fresh = records.filter((r) => !existingKeys.has(acquirerKey(r)));
      const duplicateCount = records.length - fresh.length;

      if (fresh.length > 0) {
        const source = await getOrCreateSource(tenantId, "acquirer_report", "Relatório Maquininha");
        const now = new Date().toISOString();
        await base44.entities.AcquirerSettlement.bulkCreate(
          fresh.map((r) => ({ ...r, tenant_id: tenantId, source_id: source.id, status: "pending", imported_at: now }))
        );
      }
      toast({
        title: fresh.length ? "Relatório de maquininha importado" : "Nada de novo",
        description: `${fresh.length} novos, ${duplicateCount} já existiam (ignorados).`,
      });
      acquirer.reload();
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

      <div className="grid md:grid-cols-3 gap-4">
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
          <input ref={cashRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { startCashImport(e.target.files[0]); e.target.value = ""; }} />
          <Button disabled={busy === "cash"} onClick={() => requireTenant() && cashRef.current.click()} className="w-full bg-green-600 hover:bg-green-500">
            <Upload className="w-4 h-4 mr-2" /> {busy === "cash" ? "Lendo arquivo..." : "Enviar planilha de caixa"}
          </Button>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-purple-600/15 flex items-center justify-center"><CreditCard className="w-4.5 h-4.5 text-purple-400" /></div>
            <div>
              <p className="font-medium text-slate-200">Relatório da maquininha</p>
              <p className="text-xs text-slate-500">Stone/Ton/Cielo/Rede</p>
            </div>
          </div>
          <input ref={acquirerRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { startAcquirerImport(e.target.files[0]); e.target.value = ""; }} />
          <Button disabled={busy === "acquirer"} onClick={() => requireTenant() && acquirerRef.current.click()} className="w-full bg-purple-600 hover:bg-purple-500">
            <Upload className="w-4 h-4 mr-2" /> {busy === "acquirer" ? "Lendo arquivo..." : "Enviar relatório da maquininha"}
          </Button>
        </div>
      </div>

      <ColumnMappingModal
        isOpen={!!pendingCash}
        onClose={() => setPendingCash(null)}
        fileHeaders={pendingCash?.headers || []}
        onConfirm={confirmCashImport}
      />

      <ColumnMappingModal
        isOpen={!!pendingAcquirer}
        onClose={() => setPendingAcquirer(null)}
        fileHeaders={pendingAcquirer?.headers || []}
        onConfirm={confirmAcquirerImport}
        fields={ACQUIRER_MODAL_FIELDS}
        title="Mapeamento de colunas — Relatório da Maquininha"
      />

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { title: "Últimas transações bancárias", pager: bank, empty: "Nenhum OFX importado ainda." },
          { title: "Últimos lançamentos de caixa", pager: cash, empty: "Nenhuma planilha importada ainda." },
          { title: "Últimas liquidações da maquininha", pager: acquirer, empty: "Nenhum relatório de maquininha importado ainda." },
        ].map(({ title, pager, empty }) => (
          <div key={title} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <p className="text-sm font-medium text-slate-300 px-5 py-3.5 border-b border-slate-700">{title}</p>
            {pager.loading ? (
              <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin" /></div>
            ) : pager.items.length === 0 ? (
              <EmptyState icon={FileWarning} title={empty} />
            ) : (
              <div className="divide-y divide-slate-700/60">
                {pager.items.map((t) => {
                  const isAcquirer = t.sale_date !== undefined;
                  const label = isAcquirer ? (t.card_brand || "Maquininha") : (t.description || t.payment_method || "—");
                  const date = isAcquirer ? t.sale_date : t.date;
                  const amount = isAcquirer ? t.gross_amount : t.amount;
                  const isDebit = isAcquirer ? false : t.type === "debit";
                  return (
                    <div key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="text-slate-300 truncate">{label}</p>
                        <p className="text-xs text-slate-500">{date}{isAcquirer && t.settlement_date ? ` → liquida ${t.settlement_date}` : ""}</p>
                      </div>
                      <span className={`tabular-nums shrink-0 ml-4 ${isDebit ? "text-red-400" : "text-green-400"}`}>
                        {typeof amount === "number" ? amount.toFixed(2).replace(".", ",") : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <DataPagination page={pager.page} hasMore={pager.hasMore} onPageChange={pager.setPage} className="border-t border-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}