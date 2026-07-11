import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'

const AuthContext = createContext(null)

// Usuário mock para desenvolvimento (sem Supabase configurado)
const DEV_USER = {
  id: 'dev-mock-user',
  email: 'admin@vasselai.com.br',
  user_metadata: { company_name: 'Vasselai Imóveis' },
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) {
      // Modo dev: auto-login com usuário mock
      setUser(DEV_USER)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email, password) => {
    if (!supabaseConfigured) {
      setUser(DEV_USER)
      return { error: null }
    }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signUp = async (email, password, meta) => {
    if (!supabaseConfigured) {
      setUser({ ...DEV_USER, email, user_metadata: meta })
      return { error: null }
    }
    return supabase.auth.signUp({ email, password, options: { data: meta } })
  }

  const signOut = async () => {
    if (!supabaseConfigured) {
      setUser(null)
      return
    }
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
