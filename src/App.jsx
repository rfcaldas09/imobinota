import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
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

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  return user ? children : <Navigate to="/" replace />
}

function AppRoutes() {
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route path="/"      element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Rotas privadas */}
      <Route path="/dashboard"  element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/contratos"  element={<PrivateRoute><Layout><Contratos /></Layout></PrivateRoute>} />
      <Route path="/cobrancas"  element={<PrivateRoute><Layout><Cobrancas /></Layout></PrivateRoute>} />
      <Route path="/relatorios" element={<PrivateRoute><Layout><Relatorios /></Layout></PrivateRoute>} />
      <Route path="/inquilinos" element={<PrivateRoute><Layout><Inquilinos /></Layout></PrivateRoute>} />
      <Route path="/config"     element={<PrivateRoute><Layout><Config /></Layout></PrivateRoute>} />
      <Route path="/plano"      element={<PrivateRoute><Layout><Plano /></Layout></PrivateRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
