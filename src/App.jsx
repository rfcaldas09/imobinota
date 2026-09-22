import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { SubscriptionProvider } from './contexts/SubscriptionContext'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Contratos from './pages/Contratos'
import Cobrancas from './pages/Cobrancas'
import Relatorios from './pages/Relatorios'
import Inquilinos from './pages/Inquilinos'
import Config from './pages/Config'
import Plano from './pages/Plano'
import NfseAvulsa from './pages/NfseAvulsa'
import AdminCupons from './pages/AdminCupons'
import Inadimplencia from './pages/Inadimplencia'
import Desembolsos from './pages/Desembolsos'
import OnboardingWizard, { useOnboarding } from './components/OnboardingWizard'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? children : <Navigate to="/" replace />
}

// Rota acessível apenas para usuários NÃO afiliados (ex: tela de plano/pagamento)
function DirectClientRoute({ children }) {
  const { user, loading, isAffiliate } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/" replace />
  if (isAffiliate) return <Navigate to="/dashboard" replace />
  return children
}

function AppContent() {
  const { wizardOpen, closeWizard, termsOnly } = useOnboarding()
  return (
    <>
      <AppRoutes />
      {wizardOpen && (
        <OnboardingWizard
          onComplete={() => closeWizard(true)}
          termsOnly={termsOnly}
        />
      )}
    </>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/"      element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard"  element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/contratos"  element={<PrivateRoute><Layout><Contratos /></Layout></PrivateRoute>} />
      <Route path="/cobrancas"  element={<PrivateRoute><Layout><Cobrancas /></Layout></PrivateRoute>} />
      <Route path="/relatorios" element={<PrivateRoute><Layout><Relatorios /></Layout></PrivateRoute>} />
      <Route path="/inquilinos" element={<PrivateRoute><Layout><Inquilinos /></Layout></PrivateRoute>} />
      <Route path="/config"     element={<PrivateRoute><Layout><Config /></Layout></PrivateRoute>} />
      <Route path="/plano"      element={<DirectClientRoute><Layout><Plano /></Layout></DirectClientRoute>} />
      <Route path="/nfse-avulsa"   element={<PrivateRoute><Layout><NfseAvulsa /></Layout></PrivateRoute>} />
      <Route path="/inadimplencia" element={<PrivateRoute><Layout><Inadimplencia /></Layout></PrivateRoute>} />
      <Route path="/desembolsos"   element={<PrivateRoute><Layout><Desembolsos /></Layout></PrivateRoute>} />
      {/* Rota admin — sem link na sidebar, acesso direto pela URL */}
      <Route path="/admin/cupons"  element={<PrivateRoute><Layout><AdminCupons /></Layout></PrivateRoute>} />
      <Route path="*"              element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SubscriptionProvider>
          <AppContent />
        </SubscriptionProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
