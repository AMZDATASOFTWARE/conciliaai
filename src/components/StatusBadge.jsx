import React from 'react';

const STYLES = {
  reconciled: 'bg-green-500/15 text-green-400 border-green-500/30',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  divergent: 'bg-red-500/15 text-red-400 border-red-500/30',
  manual: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  partial: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  already_reconciled: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  inactive: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  debit: 'bg-red-500/15 text-red-400 border-red-500/30',
  credit: 'bg-green-500/15 text-green-400 border-green-500/30',
};

const LABELS = {
  reconciled: 'Conciliado',
  pending: 'Pendente',
  divergent: 'Divergente',
  manual: 'Manual',
  partial: 'Parcial',
  already_reconciled: 'Já conciliado (upload anterior)',
  active: 'Ativo',
  inactive: 'Inativo',
  debit: 'Débito',
  credit: 'Crédito',
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STYLES[status] || STYLES.pending}`}>
      {LABELS[status] || status}
    </span>
  );
}