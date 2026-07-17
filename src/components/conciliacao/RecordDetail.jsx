import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/StatusBadge";
import { Brain, BookOpen, Check, AlertTriangle, Lock, RotateCcw } from "lucide-react";

export default function RecordDetail({ record, rule, onClose, onSetStatus, onReopen }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Registro conciliado <StatusBadge status={record.status} /> {record.locked && <Lock className="w-4 h-4 text-slate-500" />}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {record.locked && (
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs text-slate-400 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0" /> Já exportado para a Conta Azul ({record.exported_at ? new Date(record.exported_at).toLocaleDateString("pt-BR") : ""}) — travado contra edição. Use "Reabrir Conciliação" se precisar corrigir.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-slate-500">Data</p><p className="text-slate-200">{record.reconciliation_date}</p></div>
            <div><p className="text-xs text-slate-500">Valor</p><p className={`tabular-nums font-medium ${record.amount < 0 ? "text-red-400" : "text-green-400"}`}>{typeof record.amount === "number" ? record.amount.toFixed(2).replace(".", ",") : "—"}</p></div>
            <div><p className="text-xs text-slate-500">Categoria</p><p className="text-slate-200">{record.category || "—"}</p></div>
            <div><p className="text-xs text-slate-500">Responsável</p><p className="text-slate-200">{record.responsible || "—"}</p></div>
          </div>
          <div>
            <p className="text-xs text-slate-500">Descrição original</p>
            <p className="text-slate-300 font-mono text-xs mt-1 bg-slate-800 rounded-lg p-2.5 border border-slate-700">{record.description || "—"}</p>
          </div>
          <div className="bg-blue-600/10 border border-blue-500/25 rounded-lg p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-blue-400 mb-1.5"><Brain className="w-3.5 h-3.5" /> Raciocínio da IA (ai_reasoning)</p>
            <p className="text-slate-300 text-xs leading-relaxed">{record.ai_reasoning || "Sem raciocínio registrado."}</p>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5"><BookOpen className="w-3.5 h-3.5" /> Regra utilizada (matched_by_rule_id)</p>
            {rule ? (
              <p className="text-xs text-slate-300">
                <span className="font-mono text-amber-400">"{rule.keyword}"</span> → {rule.map_to}
                {rule.category && <span className="text-slate-500"> · {rule.category}</span>}
                {rule.is_pf && <span className="text-slate-500"> · PF</span>}
              </p>
            ) : (
              <p className="text-xs text-slate-500">Nenhuma regra do dicionário foi utilizada neste match.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            {record.locked ? (
              <Button size="sm" variant="outline" onClick={() => onReopen(record)} className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                <RotateCcw className="w-4 h-4 mr-1.5" /> Reabrir Conciliação
              </Button>
            ) : (
              <>
                {record.status !== "divergent" && (
                  <Button size="sm" variant="outline" onClick={() => onSetStatus(record, "divergent")} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                    <AlertTriangle className="w-4 h-4 mr-1.5" /> Divergente
                  </Button>
                )}
                {record.status !== "reconciled" && (
                  <Button size="sm" onClick={() => onSetStatus(record, "manual")} className="bg-green-600 hover:bg-green-500">
                    <Check className="w-4 h-4 mr-1.5" /> Aprovar
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}