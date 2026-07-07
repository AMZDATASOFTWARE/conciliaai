import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState(() => localStorage.getItem('bpo_tenant_id') || 'all');
  const [loading, setLoading] = useState(true);

  const refreshTenants = useCallback(async () => {
    const list = await base44.entities.Tenant.list('-created_date', 200);
    setTenants(list);
    setLoading(false);
  }, []);

  useEffect(() => { refreshTenants(); }, [refreshTenants]);

  const selectTenant = (id) => {
    setTenantId(id);
    localStorage.setItem('bpo_tenant_id', id);
  };

  const activeTenant = tenants.find((t) => t.id === tenantId) || null;

  return (
    <TenantContext.Provider value={{ tenants, tenantId, activeTenant, selectTenant, refreshTenants, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);