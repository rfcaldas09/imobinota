import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Dias de trial gratuito após primeiro cadastro
export const TRIAL_DAYS = 2

const SubscriptionContext = createContext(null)

export function SubscriptionProvider({ children }) {
  const { user, parentUserId } = useAuth()
  const [sub, setSub]         = useState(null)  // dados crus do profiles
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setSub(null); setLoading(false); return }
    setLoading(true)

    // Afiliados herdam o plano do pai — busca o profile do pai em vez do próprio
    const targetId = parentUserId ?? user.id

    const { data, error } = await supabase
      .from('profiles')
      .select('plano_tipo, plano_fim')
      .eq('id', targetId)
      .maybeSingle()

    // Se retornou null mas o usuário está autenticado, pode ser JWT expirado.
    // Força refresh de sessão e tenta novamente uma vez.
    if (!data && !error) {
      const { error: refreshError } = await supabase.auth.refreshSession()
      if (!refreshError) {
        const { data: retried } = await supabase
          .from('profiles')
          .select('plano_tipo, plano_fim')
          .eq('id', targetId)
          .maybeSingle()
        setSub(retried)
        setLoading(false)
        return
      }
    }

    setSub(data)
    setLoading(false)
  }, [user?.id, parentUserId])  // re-busca se o user ou o pai mudar

  useEffect(() => { load() }, [load])

  // ── Calcula estado da assinatura ──────────────────────────────────
  const subscription = (() => {
    if (loading) return { loading: true, isActive: false, isTrial: false, plan: null, daysLeft: 0 }

    const now = new Date()

    // Afiliados nunca entram em trial próprio — dependem inteiramente do pai
    if (parentUserId) {
      if (!sub?.plano_tipo || sub.plano_tipo === 'trial') {
        // Pai ainda em trial: afiliado também considera ativo durante o trial do pai
        const createdAt = user?.created_at ? new Date(user.created_at) : now
        const trialEnd  = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 3600 * 1000)
        const daysLeft  = Math.max(0, Math.ceil((trialEnd - now) / 86400000))
        return { loading: false, isActive: daysLeft > 0, isTrial: true, plan: 'trial', daysLeft, trialEnd }
      }
      const fim      = sub.plano_fim ? new Date(sub.plano_fim) : null
      const isActive = fim ? fim > now : false
      const daysLeft = fim ? Math.max(0, Math.ceil((fim - now) / 86400000)) : 0
      return { loading: false, isActive, isTrial: false, plan: sub.plano_tipo, daysLeft, planoFim: fim }
    }

    // ── Usuário direto (sem pai) — lógica original ──────────────────
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
