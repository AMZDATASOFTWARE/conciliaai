import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const FIELDS = [
  { key: "date", label: "Data da Transação" },
  { key: "amount", label: "Valor da Transação" },
  { key: "description", label: "Descrição / Histórico" },
];

export default function ColumnMappingModal({ isOpen, onClose, fileHeaders = [], onConfirm }) {
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    if (isOpen) setMapping({});
  }, [isOpen]);

  const complete = FIELDS.every((f) => mapping[f.key]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mapeamento de colunas</DialogTitle>
          <DialogDescription className="text-slate-400">
            Indique qual coluna do seu arquivo corresponde a cada campo do sistema.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-slate-300 text-xs">{f.label} *</Label>
              <Select value={mapping[f.key] || ""} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}>
                <SelectTrigger className="bg-slate-900 border-slate-700 mt-1">
                  <SelectValue placeholder="Selecione a coluna do arquivo" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                  {fileHeaders.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-600">Cancelar</Button>
          <Button disabled={!complete} onClick={() => onConfirm(mapping)} className="bg-green-600 hover:bg-green-500">
            Confirmar Importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}