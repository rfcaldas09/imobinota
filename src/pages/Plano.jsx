import { useState } from 'react'

const PLAN = {
  name:       'ImobiNota Essencial',
  price:      297.00,
  startDate:  '18/06/2026',
  renewDate:  '18/07/2026',
  totalDays:  30,
  usedDays:   19,
  pixKey:     '12.345.678/0001-90',
  pixKeyType: 'CNPJ',
  beneficiary:'TechLinker Soluções Ltda.',
  bankName:   'Banco Inter',
}

const HISTORY = [
  { mes:'Junho / 2026',  valor:'R$ 297,00', status:'Pago', data:'18/06/2026' },
  { mes:'Maio / 2026',   valor:'R$ 297,00', status:'Pago', data:'18/05/2026' },
  { mes:'Abril / 2026',  valor:'R$ 297,00', status:'Pago', data:'18/04/2026' },
]

// QR Code mockado via SVG puro
function FakeQR({ size = 160 }) {
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
    (r>=2&&r<=4&&c>=2&&c<=4) || (r>=2&&r<=4&&c>=N-5&&c<=N-3) || (r>=N-5&&r<=N-3&&c>=2&&c<=4)

  const cells = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const inFinder = (r<7&&c<7)||(r<7&&c>=N-7)||(r>=N-7&&c<7)
      let dark
      if (inFinder) {
        dark = isFinderBorder(r,c) || isFinderDot(r,c)
      } else {
        dark = (r*31+c*17+r*c*7) % 100 < 45
      }
      if (dark) cells.push({ r, c })
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="white" rx="4"/>
      {cells.map(({ r, c }) => (
        <rect key={`${r}-${c}`} x={c*cell+0.5} y={r*cell+0.5} width={cell-0.5} height={cell-0.5} fill="#1e293b"/>
      ))}
    </svg>
  )
}

export default function Plano() {
  const [copied, setCopied] = useState(false)

  const remaining = PLAN.totalDays - PLAN.usedDays
  const pct       = Math.round(PLAN.usedDays / PLAN.totalDays * 100)
  const urgent    = remaining <= 5
  const warn      = remaining <= 10

  const copyPix = () => {
    navigator.clipboard?.writeText(PLAN.pixKey).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900">Meu Plano</h1>
        <p className="text-sm text-slate-500">Gerencie sua assinatura do ImobiNota</p>
      </div>

      {/* Plano atual + progresso */}
      <div className={`bg-white border rounded-2xl p-5 border-l-4 ${urgent ? 'border-l-red-500 border-red-100' : warn ? 'border-l-amber-400 border-amber-100' : 'border-l-indigo-500 border-slate-100'}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Plano atual</p>
            <p className="text-xl font-bold text-slate-900">{PLAN.name}</p>
            <p className="text-slate-500 text-sm mt-0.5">
              Renova em {PLAN.renewDate} · R$ {PLAN.price.toFixed(2).replace('.',',')}/mês
            </p>
          </div>
          <span className={`text-sm font-semibold px-3 py-1.5 rounded-full flex-shrink-0 ${
            urgent ? 'bg-red-100 text-red-700' : warn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {remaining} dias restantes
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1.5">
          <div className={`h-2.5 rounded-full transition-all ${urgent ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}/>
        </div>
        <div className="flex justify-between text-xs text-slate-400">
          <span>{PLAN.startDate}</span>
          <span>{PLAN.usedDays} de {PLAN.totalDays} dias usados</span>
          <span>{PLAN.renewDate}</span>
        </div>
        {urgent && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700">
            ⚠️ Seu plano vence em breve! Realize o pagamento para não ter interrupção no serviço.
          </div>
        )}
      </div>

      {/* Pagamento via PIX */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-800 mb-1">Pagar com PIX</h3>
        <p className="text-xs text-slate-400 mb-4">Pagamento instantâneo · Processado em até 1h útil</p>
        <div className="flex gap-6 items-start">
          <div className="shrink-0 p-2 border border-slate-200 rounded-xl bg-white">
            <FakeQR size={140}/>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Beneficiário</p>
              <p className="text-sm font-semibold text-slate-900">{PLAN.beneficiary}</p>
              <p className="text-xs text-slate-400">{PLAN.bankName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Chave {PLAN.pixKeyType}</p>
              <p className="text-sm font-mono font-semibold text-slate-900">{PLAN.pixKey}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Valor</p>
              <p className="text-lg font-bold text-indigo-600">R$ {PLAN.price.toFixed(2).replace('.',',')}</p>
            </div>
            <button onClick={copyPix}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all w-full justify-center ${
                copied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {copied ? '✅ Copiado!' : '📋 Copiar chave PIX'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-4 text-center">
          Após o pagamento, envie o comprovante para <strong>financeiro@techlinker.com.br</strong>
        </p>
      </div>

      {/* Histórico */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-800 mb-3">Histórico de Pagamentos</h3>
        <div className="space-y-2">
          {HISTORY.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-800">{h.mes}</p>
                <p className="text-xs text-slate-400">{h.data}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900">{h.valor}</p>
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{h.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Em breve */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { icon:'🏷️', title:'Boleto automático', desc:'Geração e envio automático de boleto de renovação 10 dias antes do vencimento.' },
          { icon:'🔔', title:'Lembrete por e-mail', desc:'Notificações automáticas sobre renovação e confirmação de pagamento.' },
        ].map(c => (
          <div key={c.title} className="bg-white border border-slate-100 rounded-2xl p-4 opacity-70">
            <span className="text-2xl mb-2 block">{c.icon}</span>
            <p className="font-semibold text-slate-800 text-sm mb-1">{c.title}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{c.desc}</p>
            <span className="inline-block mt-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Em breve</span>
          </div>
        ))}
      </div>
    </div>
  )
}
