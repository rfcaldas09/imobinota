import { useState, useEffect } from 'react'

// ── Dados do plano atual (mockado — virá do Supabase via OpenPIX) ──
const CURRENT = {
  plan:       'essencial',
  startDate:  '18/06/2026',
  renewDate:  '18/07/2026',
  totalDays:  30,
  usedDays:   19,
}

// ── Planos disponíveis ────────────────────────────────────────────
const PLANS = {
  essencial: {
    id:       'essencial',
    name:     'ImobiNota Essencial',
    price:    297,
    color:    'indigo',
    features: [
      'Até 100 contratos ativos',
      'R$ 2,99 por boleto pago',
      'Emissão de boletos via OpenPIX',
      'NFS-e integrado (API Nacional)',
      'Envio de e-mails automático',
      'Dashboard e relatórios',
      'Suporte via e-mail',
    ],
    // Mock PIX — substituir pelos dados reais do OpenPIX
    pixKey:     '12.345.678/0001-90',
    pixKeyType: 'CNPJ',
    pixPayload: '00020126580014BR.GOV.BCB.PIX0136a629532e-7693-4846-b028-f142a1d7d1935204000053039865802BR5913TechLinker6008Joinville62070503***63041D3D',
    beneficiary:'TechLinker Soluções Ltda.',
  },
  pro: {
    id:       'pro',
    name:     'ImobiNota Pro',
    price:    497,
    color:    'purple',
    features: [
      'Tudo do Essencial',
      'Contratos ilimitados',
      'R$ 2,99 por boleto pago',
      'Suporte prioritário via WhatsApp',
    ],
    pixKey:     '12.345.678/0001-90',
    pixKeyType: 'CNPJ',
    pixPayload: '00020126580014BR.GOV.BCB.PIX0136a629532e-7693-4846-b028-f142a1d7d1935204000053039865802BR5913TechLinker6008Joinville62070503***63041D3D',
    beneficiary:'TechLinker Soluções Ltda.',
  },
}

// ── QR Code mockado (SVG puro, sem dependências) ─────────────────
function FakeQR({ size = 148 }) {
  const N = 21, cell = size / N
  const isFinderBorder = (r, c) => {
    const inTL = r < 7 && c < 7
    const inTR = r < 7 && c >= N - 7
    const inBL = r >= N - 7 && c < 7
    if (!inTL && !inTR && !inBL) return false
    if (inTL) return r===0||r===6||c===0||c===6
    if (inTR) return r===0||r===6||c===N-7||c===N-1
    return r===N-7||r===N-1||c===0||c===6
  }
  const isFinderDot = (r, c) =>
    (r>=2&&r<=4&&c>=2&&c<=4) ||
    (r>=2&&r<=4&&c>=N-5&&c<=N-3) ||
    (r>=N-5&&r<=N-3&&c>=2&&c<=4)

  const cells = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inFinder = (r<7&&c<7)||(r<7&&c>=N-7)||(r>=N-7&&c<7)
      let dark
      if (inFinder) {
        dark = isFinderBorder(r,c) || isFinderDot(r,c)
      } else {
        dark = (r*31 + c*17 + r*c*7) % 100 < 45
      }
      if (dark) cells.push({ r, c })
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx="4"/>
      {cells.map(({ r, c }) => (
        <rect key={`${r}-${c}`} x={c*cell+0.5} y={r*cell+0.5}
          width={cell-0.5} height={cell-0.5} fill="#1e293b"/>
      ))}
    </svg>
  )
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

// ── Painel de pagamento PIX ───────────────────────────────────────
function PixPanel({ plan, onClose }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  const copyKey = () => {
    navigator.clipboard?.writeText(plan.pixPayload).catch(() => {})
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

      <div className="flex gap-5 items-start">
        {/* QR Code */}
        <div className="shrink-0 p-2 border border-slate-200 rounded-xl bg-white shadow-sm">
          <FakeQR size={148}/>
          <p className="text-center text-xs text-slate-400 mt-1.5">Escaneie com seu banco</p>
        </div>

        {/* Detalhes */}
        <div className="flex-1 space-y-3">
          <div className={`rounded-xl px-4 py-3 ${accent.bgLight} border ${accent.border}`}>
            <p className={`text-xs font-semibold mb-0.5 ${accent.text}`}>Valor a pagar</p>
            <p className="text-2xl font-black text-slate-900">R$ {plan.price.toFixed(2).replace('.',',')}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-0.5">Beneficiário</p>
            <p className="text-sm font-semibold text-slate-800">{plan.beneficiary}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-0.5">Chave {plan.pixKeyType}</p>
            <p className="text-sm font-mono text-slate-700 break-all">{plan.pixKey}</p>
          </div>

          <button onClick={copyKey}
            className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
              copied ? 'bg-emerald-500 text-white' : `${accent.bg} text-white hover:opacity-90`
            }`}>
            {copied ? '✅ Copiado!' : '📋 Copiar código PIX'}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4 text-center leading-relaxed">
        Após o pagamento o acesso é liberado automaticamente em até 1h útil.
        Dúvidas? <strong className="text-slate-600">financeiro@imobinota.com.br</strong>
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Plano() {
  const [payingPlan, setPayingPlan] = useState(null) // null | 'essencial' | 'pro'

  const remaining = CURRENT.totalDays - CURRENT.usedDays
  const pct       = Math.round(CURRENT.usedDays / CURRENT.totalDays * 100)
  const urgent    = remaining <= 5
  const warn      = remaining <= 10

  const handleAssinar = (planId) => {
    setPayingPlan(prev => prev === planId ? null : planId)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900">Meu Plano</h1>
        <p className="text-sm text-slate-500">Gerencie sua assinatura do ImobiNota</p>
      </div>

      {/* Status do plano atual */}
      <div className={`bg-white border rounded-2xl p-5 border-l-4 ${
        urgent ? 'border-l-red-500 border-red-100'
        : warn  ? 'border-l-amber-400 border-amber-100'
        : 'border-l-indigo-500 border-slate-100'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Plano ativo</p>
            <p className="text-xl font-bold text-slate-900">{PLANS[CURRENT.plan].name}</p>
            <p className="text-slate-500 text-sm mt-0.5">
              Renova em {CURRENT.renewDate} · R$ {PLANS[CURRENT.plan].price.toFixed(2).replace('.',',')}/mês
            </p>
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full flex-shrink-0 ${
            urgent ? 'bg-red-100 text-red-700'
            : warn  ? 'bg-amber-100 text-amber-700'
            : 'bg-emerald-100 text-emerald-700'
          }`}>
            {remaining} dias restantes
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 mb-1.5">
          <div className={`h-2 rounded-full transition-all ${urgent ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}/>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>{CURRENT.startDate}</span>
          <span>{CURRENT.usedDays} de {CURRENT.totalDays} dias usados</span>
          <span>{CURRENT.renewDate}</span>
        </div>
        {urgent && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
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
            isCurrent={plan.id === CURRENT.plan}
            isPaying={payingPlan === plan.id}
            onAssinar={handleAssinar}
          />
        ))}
      </div>

      {/* Painel de pagamento PIX — aparece quando um plano é selecionado */}
      {payingPlan && (
        <PixPanel
          plan={PLANS[payingPlan]}
          onClose={() => setPayingPlan(null)}
        />
      )}

      {/* Em breve */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 opacity-70">
        <span className="text-2xl mb-2 block">🏷️</span>
        <p className="font-semibold text-slate-800 text-sm mb-1">Boleto automático</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          Geração e envio automático do boleto de renovação 10 dias antes do vencimento.
        </p>
        <span className="inline-block mt-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Em breve</span>
      </div>
    </div>
  )
}
