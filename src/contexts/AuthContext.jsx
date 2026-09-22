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
  const [isContabilidade, setIsContabilidade] = useState(false)
  const [controlaGarantidora, setControlaGarantidora] = useState(false)
  const [parentUserId, setParentUserId] = useState(null) // afiliado: id do usuário pai

  const loadProfile = async (userId) => {
    if (!userId || !supabaseConfigured) return
    const { data } = await supabase
      .from('profiles')
      .select('is_contabilidade, controla_garantidora, parent_user_id')
      .eq('id', userId)
      .maybeSingle()
    setIsContabilidade(!!data?.is_contabilidade)
    setControlaGarantidora(!!data?.controla_garantidora)
    setParentUserId(data?.parent_user_id ?? null)
  }

  useEffect(() => {
    if (!supabaseConfigured) {
      // Modo dev: auto-login com usuário mock
      setUser(DEV_USER)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      loadProfile(session?.user?.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setIsContabilidade(false)
        setControlaGarantidora(false)
        setParentUserId(null)
      } else if (session?.user) {
        const isNew = !user || user.id !== session.user.id
        setUser(prev => prev?.id === session.user.id ? prev : session.user)
        if (isNew) loadProfile(session.user.id)
      }
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

  // isAffiliate: usuário cujo acesso é gerenciado por um pai (contabilidade revendedora)
  const isAffiliate = !!parentUserId

  return (
    <AuthContext.Provider value={{
      user, loading,
      isContabilidade, controlaGarantidora,
      parentUserId, isAffiliate,
      signIn, signUp, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
