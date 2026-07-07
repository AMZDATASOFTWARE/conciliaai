import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { TenantProvider, useTenant } from '@/lib/TenantContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LayoutDashboard, Building2, Upload, GitMerge, BookOpen, Brain, FileDown } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tenants', label: 'Clientes', icon: Building2 },
  { to: '/imports', label: 'Importações', icon: Upload },
  { to: '/reconciliation', label: 'Conciliação', icon: GitMerge },
  { to: '/rules', label: 'Dicionário de Regras', icon: BookOpen },
  { to: '/memory', label: 'Memória Contextual', icon: Brain },
  { to: '/export', label: 'Exportação Conta Azul', icon: FileDown },
];

function TenantSelector() {
  const { tenants, tenantId, selectTenant } = useTenant();
  return (
    <Select value={tenantId} onValueChange={selectTenant}>
      <SelectTrigger className="bg-background border-border text-sm">
        <SelectValue placeholder="Selecionar cliente" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos os clientes</SelectItem>
        {tenants.map((t) => (
          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-border">
        <h1 className="text-lg font-bold tracking-tight">BPO <span className="text-primary">Reconcile</span></h1>
        <p className="text-xs text-muted-foreground mt-0.5">Conciliação Financeira Multi-Agente</p>
      </div>
      <div className="px-4 py-4 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Cliente ativo</p>
        <TenantSelector />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default function Layout() {
  return (
    <TenantProvider>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </TenantProvider>
  );
}