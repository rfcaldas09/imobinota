import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Dias de trial gratuito após primeiro cadastro
export const TRIAL_DAYS = 2

const SubscriptionContext = createContext(null)

export function SubscriptionProvider({ children }) {
  const { user } = useAuth()
  const [sub, setSub]       = useState(null)  // dados crus do profiles
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setSub(null); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('plano_tipo, plano_fim')
      .eq('id', user.id)
      .maybeSingle()
    setSub(data)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // ── Calcula estado da assinatura ──────────────────────────────────
  const subscription = (() => {
    if (loading) return { loading: true, isActive: false, isTrial: false, plan: null, daysLeft: 0 }

    const now = new Date()

    // Verificar trial (baseado no created_at do auth)
    if (!sub?.plano_tipo || sub.plano_tipo === 'trial') {
      const createdAt = user?.created_at ? new Date(user.created_at) : now
      const trialEnd  = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 3600 * 1000)
      const daysLeft  = Math.max(0, Math.ceil((trialEnd - now) / 86400000))
      const isActive  = daysLeft > 0
      return { loading: false, isActive, isTrial: true, plan: 'trial', daysLeft, trialEnd }
    }

    // Plano pago
    if (sub.plano_tipo === 'essencial' || sub.plano_tipo === 'pro') {
      const fim      = sub.plano_fim ? new Date(sub.plano_fim) : null
      const isActive = fim ? fim > now : false
      const daysLeft = fim ? Math.max(0, Math.ceil((fim - now) / 86400000)) : 0
      return { loading: false, isActive, isTrial: false, plan: sub.plano_tipo, daysLeft, planoFim: fim }
    }

    // Inativo
    return { loading: false, isActive: false, isTrial: false, plan: 'inativo', daysLeft: 0 }
  })()

  return (
    <SubscriptionContext.Provider value={{ ...subscription, reload: load }}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  return useContext(SubscriptionContext)
}
