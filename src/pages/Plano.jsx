import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'

// ── Planos disponíveis ────────────────────────────────────────────
const PLANS = {
  essencial: {
    id:       'essencial',
    name:     'NotaFacil Essencial',
    price:    197,
    color:    'indigo',
    features: [
      'Até 50 contratos ativos',
      'R$ 2,99 por cobrança paga',
      'Emissão e envio de cobrança via PIX',
      'NFS-e integrado (API Nacional)',
      'Envio de e-mails automático',
      'Dashboard e relatórios',
      'Suporte via e-mail',
    ],
  },
  pro: {
    id:       'pro',
    name:     'NotaFacil Pro',
    price:    297,
    color:    'purple',
    features: [
      'Tudo do Essencial',
      'Contratos ilimitados',
      'R$ 2,99 por cobrança paga',
      'Suporte prioritário via WhatsApp',
    ],
  },
}

// ── QR Code via API pública (sem dependências) ───────────────────
function QRCodeImg({ brCode, size = 160 }) {
  if (!brCode) return (
    <div style={{ width: size, height: size }}
      className="bg-slate-100 rounded-xl flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"/>
    </div>
  )
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(brCode)}`
  return <img src={url} alt="QR Code PIX" width={size} height={size} className="rounded-xl border border-slate-200 shadow-sm"/>
}

// ── Card de plano ─────────────────────────────────────────────────
function PlanCard({ plan, isCurrent, isPaying, onAssinar }) {
  const accent = plan.color === 'purple'
    ? { ring: 'ring-purple-500', bg: 'bg-purple-600', bgLight: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' }
    : { ring: 'ring-indigo-500', bg: 'bg-indigo-600', bgLight: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' }

  return (
    <div className={`bg-white rounded-2xl border-2 transition-all flex flex-col ${
      isPaying ? `${accent.ring} ring-2 border-transparent` : isCurrent ? 'border-slate-200' : 'border-slate-100 hover:border-slate-200'
    }`}>
      <div className="p-5 flex-1">
        {isCurrent && (
          <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${accent.bgLight} ${accent.text}`}>
            ✓ Plano atual
          </span>
        )}
        <p className="font-bold text-slate-900 text-lg leading-tight">{plan.name}</p>
        <div className="flex items-baseline gap-1 mt-1 mb-4">
          <span className="text-3xl font-black text-slate-900">
            R$ {plan.price.toFixed(2).replace('.', ',')}
          </span>
          <span className="text-sm text-slate-400">/mês</span>
        </div>

        <ul className="space-y-2">
          {plan.features.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-slate-600">
              <span className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${accent.dot}`}>
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                  <polyline points="2 6 5 9 10 3" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="px-5 pb-5">
        <button
          onClick={() => onAssinar(plan.id)}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all ${
            isPaying
              ? `${accent.bg} text-white opacity-80 cursor-default`
              : isCurrent
              ? `${accent.bg} text-white hover:opacity-90`
              : `${accent.bg} text-white hover:opacity-90`
          }`}
        >
          {isPaying ? '⬇ Pagamento abaixo' : isCurrent ? '🔄 Renovar plano' : '⚡ Assinar'}
        </button>
      </div>
    </div>
  )
}

// ── Painel de pagamento PIX (real via OpenPIX) ────────────────────
function PixPanel({ plan, userId, onClose, onPaid }) {
  const [brCode, setBrCode]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  // Gera cobrança ao abrir o painel
  useEffect(() => {
    let cancelled = false
    const generate = async () => {
      setLoading(true); setError('')
      try {
        const res = await fetch('/.netlify/functions/plano-pagar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id, userId }),
        })
        const data = await res.json()
        if (!cancelled) {
          if (!res.ok || data.error) { setError(data.error || 'Erro ao gerar cobrança'); return }
          setBrCode(data.brCode)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    generate()
    return () => { cancelled = true }
  }, [plan.id, userId])

  const copyCode = () => {
    if (!brCode) return
    navigator.clipboard?.writeText(brCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const accent = plan.color === 'purple'
    ? { bg: 'bg-purple-600', bgLight: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' }
    : { bg: 'bg-indigo-600', bgLight: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }

  return (
    <div className={`bg-white border-2 ${accent.border} rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-bold text-slate-900">Pagamento via PIX</p>
          <p className="text-xs text-slate-400 mt-0.5">{plan.name} · R$ {plan.price.toFixed(2).replace('.',',')} /mês</p>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-3">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
          Gerando QR Code…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* QR Code real */}
          <div className="shrink-0 p-2 border border-slate-200 rounded-xl bg-white shadow-sm">
            <QRCodeImg brCode={brCode} size={152}/>
            <p className="text-center text-xs text-slate-400 mt-1.5">Escaneie com seu banco</p>
          </div>

          {/* Detalhes */}
          <div className="flex-1 space-y-3">
            <div className={`rounded-xl px-4 py-3 ${accent.bgLight} border ${accent.border}`}>
              <p className={`text-xs font-semibold mb-0.5 ${accent.text}`}>Valor a pagar</p>
              <p className="text-2xl font-black text-slate-900">R$ {plan.price.toFixed(2).replace('.',',')}</p>
            </div>

            {brCode && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Código PIX copia e cola</p>
                <p className="text-xs font-mono text-slate-600 break-all bg-slate-50 rounded-lg p-2 leading-relaxed">
                  {brCode.slice(0, 60)}…
                </p>
              </div>
            )}

            <button onClick={copyCode} disabled={!brCode}
              className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 ${
                copied ? 'bg-emerald-500 text-white' : `${accent.bg} text-white hover:opacity-90`
              }`}>
              {copied ? '✅ Copiado!' : '📋 Copiar código PIX'}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
        Após o pagamento o acesso é liberado automaticamente.
        Dúvidas? <strong className="text-slate-600">contato@notafacilapp.com.br</strong>
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Plano() {
  const { user }  = useAuth()
  const sub       = useSubscription()
  const [payingPlan, setPayingPlan] = useState(null) // null | 'essencial' | 'pro'

  const daysLeft  = sub.daysLeft ?? 0
  const urgent    = daysLeft <= 1
  const warn      = daysLeft <= 2
  const planKey   = (sub.plan === 'essencial' || sub.plan === 'pro') ? sub.plan : null

  // Formata data legível
  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  const handleAssinar = (planId) => {
    setPayingPlan(prev => prev === planId ? null : planId)
  }

  const statusLabel = () => {
    if (sub.loading)   return 'Carregando…'
    if (sub.isTrial)   return `Trial gratuito — ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`
    if (!sub.isActive) return 'Assinatura encerrada'
    return `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900">Meu Plano</h1>
        <p className="text-sm text-slate-500">Gerencie sua assinatura do NotaFacil</p>
      </div>

      {/* Status do plano atual */}
      <div className={`bg-white border rounded-2xl p-5 border-l-4 ${
        !sub.isActive ? 'border-l-red-500 border-red-100'
        : urgent ? 'border-l-red-500 border-red-100'
        : warn   ? 'border-l-amber-400 border-amber-100'
        : 'border-l-indigo-500 border-slate-100'
      }`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
              {sub.isTrial ? 'Período de teste' : 'Plano ativo'}
            </p>
            <p className="text-xl font-bold text-slate-900">
              {planKey ? PLANS[planKey].name : sub.isTrial ? 'NotaFacil Trial' : 'Sem plano ativo'}
            </p>
            {sub.planoFim && (
              <p className="text-slate-500 text-sm mt-0.5">
                Renova em {fmtDate(sub.planoFim)} · R$ {planKey ? PLANS[planKey].price.toFixed(2).replace('.',',') : '—'}/mês
              </p>
            )}
            {sub.isTrial && sub.trialEnd && (
              <p className="text-slate-500 text-sm mt-0.5">
                Trial encerra em {fmtDate(sub.trialEnd)}
              </p>
            )}
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full flex-shrink-0 ml-3 ${
            !sub.isActive ? 'bg-red-100 text-red-700'
            : urgent ? 'bg-red-100 text-red-700'
            : warn   ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700'
          }`}>
            {statusLabel()}
          </span>
        </div>

        {!sub.isActive && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            ⚠️ Seu acesso está encerrado. Assine um plano para retomar.
          </div>
        )}
        {sub.isActive && urgent && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            ⚠️ Seu plano vence em breve! Realize o pagamento para não ter interrupção.
          </div>
        )}
      </div>

      {/* Cards dos planos */}
      <div className="grid grid-cols-2 gap-4">
        {Object.values(PLANS).map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={sub.plan === plan.id}
            isPaying={payingPlan === plan.id}
            onAssinar={() => handleAssinar(plan.id)}
          />
        ))}
      </div>

      {/* Painel de pagamento PIX */}
      {payingPlan && (
        <PixPanel
          plan={PLANS[payingPlan]}
          userId={user?.id}
          onClose={() => setPayingPlan(null)}
        />
      )}
    </div>
  )
}
