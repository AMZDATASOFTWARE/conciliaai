import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { TenantProvider } from '@/lib/TenantContext';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Tenants from '@/pages/Tenants';
import Importacoes from '@/pages/Importacoes';
import Conciliacao from '@/pages/Conciliacao';
import Dicionario from '@/pages/Dicionario';
import Memoria from '@/pages/Memoria';
import Exportacao from '@/pages/Exportacao';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <TenantProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/importacoes" element={<Importacoes />} />
          <Route path="/conciliacao" element={<Conciliacao />} />
          <Route path="/dicionario" element={<Dicionario />} />
          <Route path="/memoria" element={<Memoria />} />
          <Route path="/exportacao" element={<Exportacao />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </TenantProvider>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App