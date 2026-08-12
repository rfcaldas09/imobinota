import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { supabase } from '../lib/supabase'

// ── Planos disponíveis ────────────────────────────────────────────
const PLANS = {
  essencial: {
    id:       'essencial',
    name:     'Essencial',
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
    name:     'Pro',
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

// ── Helpers ───────────────────────────────────────────────────────
const fmtBRL = n => `R$ ${Number(n).toFixed(2).replace('.', ',')}`

// Carrega Stripe.js via CDN (apenas uma vez)
let stripeJsPromise = null
function getStripeJs(publishableKey) {
  if (stripeJsPromise) return stripeJsPromise
  stripeJsPromise = new Promise((resolve, reject) => {
    if (window.Stripe) { resolve(window.Stripe(publishableKey)); return }
    const script = document.createElement('script')
    script.src   = 'https://js.stripe.com/v3/'
    script.async = true
    script.onload  = () => resolve(window.Stripe(publishableKey))
    script.onerror = () => reject(new Error('Falha ao carregar Stripe.js'))
    document.head.appendChild(script)
  })
  return stripeJsPromise
}

// ── QR Code via API pública ───────────────────────────────────────
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
            {fmtBRL(plan.price)}
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
            isPaying ? `${accent.bg} text-white opacity-80 cursor-default`
            : `${accent.bg} text-white hover:opacity-90`
          }`}
        >
          {isPaying ? '⬇ Pagamento abaixo' : isCurrent ? '🔄 Renovar plano' : '⚡ Assinar'}
        </button>
      </div>
    </div>
  )
}

// ── Painel PIX ────────────────────────────────────────────────────
function PixPanel({ plan, userId, couponApplied, onCouponApplied, onClose }) {
  const [brCode, setBrCode]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [copied, setCopied]   = useState(false)
  const [displayAmount, setDisplayAmount] = useState(plan.price)

  const [couponInput, setCouponInput]     = useState(couponApplied?.codigo || '')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError]     = useState('')

  const cancelRef = useRef(false)
  const accent    = plan.color === 'purple'
    ? { bg: 'bg-purple-600', bgLight: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' }
    : { bg: 'bg-indigo-600', bgLight: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }

  const generatePix = async (cupomCodigo = null) => {
    cancelRef.current = false
    setLoading(true); setError('')
    try {
      const res  = await fetch('/.netlify/functions/plano-pagar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, userId, cupomCodigo }),
      })
      const data = await res.json()
      if (cancelRef.current) return
      if (!res.ok || data.error) { setError(data.error || 'Erro ao gerar cobrança'); return }
      setBrCode(data.brCode)
      setDisplayAmount((data.amount || plan.price * 100) / 100)
    } catch (err) {
      if (!cancelRef.current) setError(err.message)
    } finally {
      if (!cancelRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    generatePix(couponApplied?.codigo || null)
    return () => { cancelRef.current = true }
  }, [plan.id, userId]) // eslint-disable-line

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true); setCouponError('')
    try {
      const codigo = couponInput.trim().toUpperCase()
      const res    = await fetch('/.netlify/functions/cupom-verificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setCouponError(data.error || 'Cupom inválido'); return }
      onCouponApplied({ codigo, valorMensal: data.valorMensal })
      generatePix(codigo)
    } catch (err) {
      setCouponError(err.message)
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    onCouponApplied(null)
    setCouponInput('')
    setCouponError('')
    generatePix(null)
  }

  const copyCode = () => {
    if (!brCode) return
    navigator.clipboard?.writeText(brCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-4">
      {/* Cupom */}
      <div>
        {couponApplied ? (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            <span className="text-emerald-600 text-sm">✅</span>
            <span className="text-sm text-emerald-700 font-semibold flex-1">
              Cupom <strong>{couponApplied.codigo}</strong> — {fmtBRL(couponApplied.valorMensal)}/mês
            </span>
            <button onClick={removeCoupon} className="text-xs text-slate-400 hover:text-slate-600 underline">remover</button>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                type="text" value={couponInput}
                onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
                onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                placeholder="Código de desconto (opcional)"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                maxLength={20}
              />
              <button onClick={applyCoupon} disabled={!couponInput.trim() || couponLoading}
                className="px-4 py-2 text-sm font-semibold bg-slate-700 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all">
                {couponLoading ? '…' : 'Aplicar'}
              </button>
            </div>
            {couponError && <p className="text-xs text-red-600 pl-1">{couponError}</p>}
          </div>
        )}
      </div>

      {/* QR */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-3">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
          Gerando QR Code…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="flex gap-5 items-start">
          <div className="shrink-0 p-2 border border-slate-200 rounded-xl bg-white shadow-sm">
            <QRCodeImg brCode={brCode} size={144}/>
            <p className="text-center text-xs text-slate-400 mt-1.5">Escaneie com seu banco</p>
          </div>
          <div className="flex-1 space-y-3">
            <div className={`rounded-xl px-4 py-3 ${accent.bgLight} border ${accent.border}`}>
              <p className={`text-xs font-semibold mb-0.5 ${accent.text}`}>Valor a pagar</p>
              {couponApplied && <p className="text-xs text-slate-400 line-through">{fmtBRL(plan.price)}</p>}
              <p className="text-2xl font-black text-slate-900">{fmtBRL(displayAmount)}</p>
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
    </div>
  )
}

// ── Painel Cartão (Stripe Elements) ───────────────────────────────
function CardPanel({ plan, userId, userEmail, couponApplied, onCouponApplied }) {
  const [step, setStep]             = useState('idle') // idle | loading | form | paying | success | error
  const [clientSecret, setClientSecret] = useState(null)
  const [publishableKey, setPubKey] = useState(null)
  const [stripeInst, setStripeInst] = useState(null)
  const [elementsInst, setElements] = useState(null)
  const [payError, setPayError]     = useState('')
  const [subscriptionId, setSubId]  = useState(null)

  const [couponInput, setCouponInput]     = useState(couponApplied?.codigo || '')
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError]     = useState('')

  const mountRef = useRef(null)
  const accent   = plan.color === 'purple'
    ? { bg: 'bg-purple-600', bgLight: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', ring: 'focus:ring-purple-300' }
    : { bg: 'bg-indigo-600', bgLight: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', ring: 'focus:ring-indigo-300' }

  // Verificar retorno de 3DS (redirect_status na URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('redirect_status') === 'succeeded') {
      setStep('success')
      // Limpa params da URL sem recarregar
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const initStripe = async (cupomCodigo = null) => {
    setStep('loading'); setPayError('')
    try {
      const res  = await fetch('/.netlify/functions/stripe-create-subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, userId, userEmail, cupomCodigo }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setStep('error'); setPayError(data.error || 'Erro ao iniciar pagamento'); return }

      if (data.alreadyActive) {
        setStep('success'); return
      }

      setClientSecret(data.clientSecret)
      setPubKey(data.publishableKey)
      setSubId(data.subscriptionId)

      // Carrega Stripe.js e monta PaymentElement
      const stripe   = await getStripeJs(data.publishableKey)
      const elements = stripe.elements({
        clientSecret: data.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary:      '#4f46e5',
            colorBackground:   '#f8fafc',
            colorText:         '#1e293b',
            colorDanger:       '#ef4444',
            fontFamily:        'system-ui, sans-serif',
            borderRadius:      '12px',
            spacingUnit:       '4px',
          },
        },
      })

      const paymentElement = elements.create('payment', {
        layout: 'tabs',
        defaultValues: { billingDetails: { email: userEmail } },
      })

      setStripeInst(stripe)
      setElements(elements)
      setStep('form')

      // Monta no DOM após render
      setTimeout(() => {
        if (mountRef.current) paymentElement.mount(mountRef.current)
      }, 0)

    } catch (err) {
      setStep('error'); setPayError(err.message)
    }
  }

  const applyCoupon = async () => {
    if (!couponInput.trim()) return
    setCouponLoading(true); setCouponError('')
    try {
      const codigo = couponInput.trim().toUpperCase()
      const res    = await fetch('/.netlify/functions/cupom-verificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setCouponError(data.error || 'Cupom inválido'); return }
      onCouponApplied({ codigo, valorMensal: data.valorMensal })
    } catch (err) {
      setCouponError(err.message)
    } finally {
      setCouponLoading(false)
    }
  }

  const removeCoupon = () => {
    onCouponApplied(null)
    setCouponInput('')
    setCouponError('')
  }

  const handlePay = async () => {
    if (!stripeInst || !elementsInst) return
    setStep('paying'); setPayError('')

    const { error } = await stripeInst.confirmPayment({
      elements: elementsInst,
      confirmParams: {
        return_url: `${window.location.origin}/plano?redirect_status=succeeded`,
      },
      redirect: 'if_required', // não redireciona se 3DS não for necessário
    })

    if (error) {
      setPayError(error.message || 'Erro ao processar pagamento')
      setStep('form')
    } else {
      // Pagamento confirmado sem redirect (sem 3DS)
      setStep('success')
    }
  }

  const displayPrice = couponApplied ? couponApplied.valorMensal : plan.price

  if (step === 'success') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
        <div className="text-4xl">🎉</div>
        <p className="font-bold text-emerald-800">Pagamento confirmado!</p>
        <p className="text-sm text-emerald-700">
          Seu plano <strong>{plan.name}</strong> está ativo. O acesso é liberado automaticamente em instantes.
        </p>
      </div>
    )
  }

  if (step === 'idle') {
    return (
      <div className="space-y-4">
        {/* Cupom antes de iniciar */}
        <div>
          {couponApplied ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <span className="text-emerald-600 text-sm">✅</span>
              <span className="text-sm text-emerald-700 font-semibold flex-1">
                Cupom <strong>{couponApplied.codigo}</strong> — {fmtBRL(couponApplied.valorMensal)}/mês
              </span>
              <button onClick={removeCoupon} className="text-xs text-slate-400 hover:text-slate-600 underline">remover</button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex gap-2">
                <input type="text" value={couponInput}
                  onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError('') }}
                  onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                  placeholder="Código de desconto (opcional)"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
                  maxLength={20}
                />
                <button onClick={applyCoupon} disabled={!couponInput.trim() || couponLoading}
                  className="px-4 py-2 text-sm font-semibold bg-slate-700 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all">
                  {couponLoading ? '…' : 'Aplicar'}
                </button>
              </div>
              {couponError && <p className="text-xs text-red-600 pl-1">{couponError}</p>}
            </div>
          )}
        </div>

        {/* Valor + botão iniciar */}
        <div className={`rounded-xl px-4 py-3 ${accent.bgLight} border ${accent.border}`}>
          <p className={`text-xs font-semibold mb-0.5 ${accent.text}`}>Valor mensal (recorrente)</p>
          {couponApplied && <p className="text-xs text-slate-400 line-through">{fmtBRL(plan.price)}</p>}
          <p className="text-2xl font-black text-slate-900">{fmtBRL(displayPrice)}</p>
          <p className="text-xs text-slate-500 mt-1">Cobrado automaticamente todo mês. Cancele quando quiser.</p>
        </div>

        <button
          onClick={() => initStripe(couponApplied?.codigo || null)}
          className={`w-full py-3 rounded-xl text-sm font-semibold text-white ${accent.bg} hover:opacity-90 transition-all flex items-center justify-center gap-2`}
        >
          💳 Inserir dados do cartão
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumo do valor */}
      <div className={`rounded-xl px-4 py-3 ${accent.bgLight} border ${accent.border}`}>
        <p className={`text-xs font-semibold mb-0.5 ${accent.text}`}>Valor mensal (recorrente)</p>
        {couponApplied && <p className="text-xs text-slate-400 line-through">{fmtBRL(plan.price)}</p>}
        <p className="text-2xl font-black text-slate-900">{fmtBRL(displayPrice)}</p>
      </div>

      {/* Stripe PaymentElement */}
      {(step === 'loading') && (
        <div className="flex items-center justify-center py-8 text-slate-400 text-sm gap-3">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
          Carregando formulário de pagamento…
        </div>
      )}

      {/* Container onde Stripe monta o formulário */}
      <div ref={mountRef} className={step === 'form' || step === 'paying' ? '' : 'hidden'} />

      {step === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {payError}
          <button onClick={() => setStep('idle')} className="block mt-1 text-xs underline">Tentar novamente</button>
        </div>
      )}

      {payError && step === 'form' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{payError}</div>
      )}

      {(step === 'form' || step === 'paying') && (
        <button
          onClick={handlePay}
          disabled={step === 'paying'}
          className={`w-full py-3 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 ${
            step === 'paying' ? 'bg-slate-400 cursor-not-allowed' : `${accent.bg} hover:opacity-90`
          }`}
        >
          {step === 'paying'
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Processando…</>
            : '🔒 Confirmar assinatura'}
        </button>
      )}

      <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd"/></svg>
        Pagamento seguro via Stripe · Seus dados não passam pelos nossos servidores
      </p>
    </div>
  )
}

// ── Painel de pagamento (wrapper com abas PIX / Cartão) ───────────
function PaymentPanel({ plan, userId, userEmail, onClose }) {
  const [tab, setTab]                   = useState('pix') // 'pix' | 'card'
  const [couponApplied, setCouponApplied] = useState(null)

  const accent = plan.color === 'purple'
    ? { border: 'border-purple-200' }
    : { border: 'border-indigo-200' }

  return (
    <div className={`bg-white border-2 ${accent.border} rounded-2xl p-5`}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-bold text-slate-900">Pagamento — {plan.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {couponApplied
              ? <><span className="line-through">{fmtBRL(plan.price)}</span> → <span className="text-emerald-600 font-semibold">{fmtBRL(couponApplied.valorMensal)}</span> /mês</>
              : `${fmtBRL(plan.price)} /mês`}
          </p>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl leading-none">×</button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-5">
        {[
          { key: 'pix',  label: '⚡ PIX' },
          { key: 'card', label: '💳 Cartão de crédito' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {tab === 'pix'
        ? <PixPanel
            plan={plan} userId={userId}
            couponApplied={couponApplied}
            onCouponApplied={setCouponApplied}
            onClose={onClose}
          />
        : <CardPanel
            plan={plan} userId={userId} userEmail={userEmail}
            couponApplied={couponApplied}
            onCouponApplied={setCouponApplied}
          />
      }

      <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
        Após o pagamento o acesso é liberado automaticamente.
        Dúvidas? <strong className="text-slate-600">comercial@techlinker.com.br</strong>
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Plano() {
  const { user }  = useAuth()
  const sub       = useSubscription()
  const [payingPlan, setPayingPlan] = useState(null)

  // Dados de assinatura Stripe (para permitir cancelamento)
  const [stripeSubId, setStripeSubId]         = useState(null)
  const [cancelConfirm, setCancelConfirm]     = useState(false)
  const [cancelling, setCancelling]           = useState(false)
  const [cancelResult, setCancelResult]       = useState(null) // { cancelAt } | null
  const [cancelError, setCancelError]         = useState('')

  const daysLeft = sub.daysLeft ?? 0
  const urgent   = daysLeft <= 1
  const warn     = daysLeft <= 2
  const planKey  = (sub.plan === 'essencial' || sub.plan === 'pro') ? sub.plan : null

  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  // Busca stripe_subscription_id quando há plano pago ativo
  const loadStripeSubId = useCallback(async () => {
    if (!user?.id || !planKey) { setStripeSubId(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', user.id)
      .maybeSingle()
    setStripeSubId(data?.stripe_subscription_id || null)
  }, [user?.id, planKey])

  useEffect(() => { loadStripeSubId() }, [loadStripeSubId])

  const handleCancelSubscription = async () => {
    if (!stripeSubId || !user?.id) return
    setCancelling(true); setCancelError('')
    try {
      const res  = await fetch('/.netlify/functions/stripe-cancel-subscription', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, subscriptionId: stripeSubId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setCancelError(data.error || 'Erro ao cancelar'); return }
      setCancelResult({ cancelAt: data.cancelAt })
      setCancelConfirm(false)
      setStripeSubId(null) // esconde o botão de cancelar após confirmação
    } catch (err) {
      setCancelError(err.message)
    } finally {
      setCancelling(false)
    }
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
              {planKey ? PLANS[planKey].name : sub.isTrial ? 'Experimentação' : 'Sem plano ativo'}
            </p>
            {sub.planoFim && !cancelResult && (
              <p className="text-slate-500 text-sm mt-0.5">
                Renova em {fmtDate(sub.planoFim)} · {planKey ? fmtBRL(PLANS[planKey].price) : '—'}/mês
              </p>
            )}
            {cancelResult?.cancelAt && (
              <p className="text-amber-600 text-sm mt-0.5 font-medium">
                ⚠️ Cancelado — acesso ativo até {fmtDate(cancelResult.cancelAt)}
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
        {sub.isActive && urgent && !cancelResult && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            ⚠️ Seu plano vence em breve! Realize o pagamento para não ter interrupção.
          </div>
        )}

        {/* Cancelamento de assinatura Stripe */}
        {stripeSubId && sub.isActive && !cancelResult && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            {!cancelConfirm ? (
              <button
                onClick={() => { setCancelConfirm(true); setCancelError('') }}
                className="text-xs text-slate-400 hover:text-red-600 underline underline-offset-2 transition-colors"
              >
                Cancelar renovação automática
              </button>
            ) : (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-red-800">Confirmar cancelamento?</p>
                <p className="text-xs text-red-700">
                  Seu acesso continua ativo até o fim do período já pago. Após isso, a renovação automática não ocorrerá mais.
                </p>
                {cancelError && <p className="text-xs text-red-600 font-medium">{cancelError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleCancelSubscription}
                    disabled={cancelling}
                    className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-all"
                  >
                    {cancelling ? 'Cancelando…' : 'Sim, cancelar renovação'}
                  </button>
                  <button
                    onClick={() => { setCancelConfirm(false); setCancelError('') }}
                    disabled={cancelling}
                    className="px-4 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    Manter assinatura
                  </button>
                </div>
              </div>
            )}
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
            onAssinar={() => setPayingPlan(prev => prev === plan.id ? null : plan.id)}
          />
        ))}
      </div>

      {/* Painel de pagamento */}
      {payingPlan && (
        <PaymentPanel
          plan={PLANS[payingPlan]}
          userId={user?.id}
          userEmail={user?.email}
          onClose={() => setPayingPlan(null)}
        />
      )}
    </div>
  )
}
