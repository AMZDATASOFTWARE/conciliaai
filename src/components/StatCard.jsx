import React from "react";

export default function StatCard({ icon: Icon, label, value, sub, accent = "text-blue-400" }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        {Icon && <Icon className={`w-4 h-4 ${accent}`} />}
      </div>
      <p className="text-2xl font-bold text-slate-50 mt-2 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}