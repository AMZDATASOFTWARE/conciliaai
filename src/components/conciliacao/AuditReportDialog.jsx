import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export default function AuditReportDialog({ open, onOpenChange, result }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumo de Auditoria — Diretor Financeiro IA</DialogTitle>
          <DialogDescription>
            {result && `${result.analyzed} transações analisadas · ${result.reconciled} conciliadas · ${result.divergent} divergentes`}
          </DialogDescription>
        </DialogHeader>
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{result?.report || ''}</ReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}