import React from "react";

const STYLES = {
  exato: "bg-green-500/15 text-green-400 border-green-500/30",
  juros_multa: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  rateio_valor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  rateio_centro_custo: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
};

const LABELS = {
  exato: "Match exato",
  juros_multa: "Juros/multa",
  rateio_valor: "Rateio (valor)",
  rateio_centro_custo: "Rateio (centro de custo)",
};

// Camadas do motor de conciliação Banco↔Conta Azul (spec do Super Agente,
// Clientes/_SPEC_MOTOR_CONCILIACAO.md seção 4) — não confundir com o motor de
// 3 pontas local (caixa↔maquininha↔banco), que usa engine_version 3way_deterministic_v1.
export default function MatchLayerBadge({ matchLayer }) {
  if (!matchLayer) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STYLES[matchLayer] || "bg-slate-500/15 text-slate-400 border-slate-500/30"}`}>
      {LABELS[matchLayer] || matchLayer}
    </span>
  );
}
