import { useState, useMemo } from 'react'
import { CONTRACTS, KPI, MONTHS_DATA, SEND_LOGS, fmt, fmtN } from '../data/mockData'
import Badge from '../components/Badge'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcChevL    = ({ c='' }) => ic('<polyline points="15 18 9 12 15 6"/>', c)
const IcChevR    = ({ c='' }) => ic('<polyline points="9 18 15 12 9 6"/>', c)
const IcSend     = ({ c='' }) => ic('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', c)
const IcCheck    = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)
const IcZap      = ({ c='' }) => ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', c)
const IcCalendar = ({ c='' }) => ic('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>', c)
const IcGrid     = ({ c='' }) => ic('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', c)

const CURRENT_IDX = 11 // Julho/2026

// ── Batch Modal ───────────────────────────────────────────────────
function BatchModal({ onClose, month }) {
  const [step, setStep]         = useState('idle')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [fails, setFails]       = useState(0)
  const total = 600

  const run = () => {
    setStep('running')
    let sent = 0, fc = 0
    const names = ['Maria Aparecida','João Carlos','Ana Paula','Carlos Eduardo','Fernanda Oliveira']
    const iv = setInterval(() => {
      const batch = Math.min(10, total - sent)
      for (let i = 0; i < batch; i++) {
        const fail = [87,231,445,578].includes(sent + i)
        if (fail) fc++
        setLogs(l => [...l.slice(-50), { name: names[(sent+i) % names.length], ok: !fail }])
      }
      sent = Math.min(sent + batch, total)
      setProgress(sent)
      setFails(fc)
      if (sent >= total) { clearInterval(iv); setTimeout(() => setStep('done'), 500) }
    }, 100)
  }

  const pct = Math.round((progress / total) * 100)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {step === 'idle' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Gerar e Enviar em Massa</h2>
            <p className="text-sm text-slate-500 mb-4">Mês de referência: <strong className="text-slate-700">{month}</strong></p>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
              {[['💳','Gerar boleto de cobrança','via OpenPIX'],
                ['📄','Emitir Nota Fiscal de Serviço (NFS-e)','via API Nacional gov.br'],
                ['📧','Enviar e-mail com ambos os documentos','para cada inquilino']].map(([ico,txt,sub])=>(
                <div key={txt} className="flex items-start gap-3 text-sm">
                  <span className="text-lg">{ico}</span>
                  <div><span className="font-medium text-slate-800">{txt}</span><span className="text-slate-400 ml-1.5 text-xs">{sub}</span></div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={run} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-200">
                <IcZap c="w-4 h-4"/> Confirmar e Enviar
              </button>
            </div>
          </div>
        )}
        {step === 'running' && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
              </div>
              <div>
                <p className="font-bold text-slate-900">Processando contratos…</p>
                <p className="text-sm text-slate-400">Não feche esta janela</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">{progress.toLocaleString('pt-BR')} / {total.toLocaleString('pt-BR')}</span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{width:`${pct}%`}}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
              {logs.slice(-30).map((l,i) => (
                <div key={i} className={l.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {l.ok ? '✓' : '✗'} {l.ok ? 'Enviado para' : 'Falha ao enviar para'} {l.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 'done' && (
          <div className="p-7 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <IcCheck c="w-8 h-8 text-emerald-600"/>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Envio concluído!</h2>
            <p className="text-slate-500 text-sm mb-5">
              {(total - fails).toLocaleString('pt-BR')} enviados com sucesso
              {fails > 0 && <span className="text-red-500"> · {fails} falhas</span>}
            </p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sparkline SVG ─────────────────────────────────────────────────
function Sparkline({ data, color='#6366f1' }) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100
    const y = 30 - ((v - min) / (max - min || 1)) * 28 + 1
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox="0 0 100 32" className="w-20 h-8" fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Visão Anual ───────────────────────────────────────────────────
function YearView({ onClose }) {
  const barMax = Math.max(...MONTHS_DATA.map(m => m.paidVal + m.pendingVal + m.overdueVal))
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900">Visão Anual — 2025/2026</h2>
            <p className="text-sm text-slate-400">Agosto/2025 a Julho/2026</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6">
          {/* Barras */}
          <div className="flex items-end gap-1 h-36 mb-2">
            {MONTHS_DATA.map((m, i) => {
              const tot = m.paidVal + m.pendingVal + m.overdueVal
              const h   = (tot / barMax) * 100
              const isCurrent = i === CURRENT_IDX
              return (
                <div key={m.key} className="flex-1 flex flex-col items-center group relative">
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap z-10 shadow-lg pointer-events-none">
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-slate-300">{fmt(tot)}</p>
                  </div>
                  <div className="w-full relative" style={{ height: `${h}%` }}>
                    <div className={`absolute inset-0 rounded-t-md ${isCurrent ? 'bg-indigo-600' : 'bg-indigo-200 group-hover:bg-indigo-400'} transition-colors`}/>
                    {m.overdueVal > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-red-400/40 rounded-b-md"
                        style={{ height:`${(m.overdueVal/tot)*100}%` }}/>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Labels */}
          <div className="flex gap-1 mb-4">
            {MONTHS_DATA.map((m, i) => (
              <div key={m.key} className="flex-1 text-center">
                <span className={`text-[9px] font-medium ${i === CURRENT_IDX ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {m.short.split('/')[0]}
                </span>
              </div>
            ))}
          </div>
          {/* Legenda */}
          <div className="flex gap-4 justify-center mb-5">
            {[['bg-indigo-600','Mês atual'],['bg-indigo-200','Outros meses'],['bg-red-400/40','Em atraso']].map(([c,l]) => (
              <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div className={`w-3 h-3 rounded-sm ${c}`}/>{l}
              </div>
            ))}
          </div>
          {/* Tabela */}
          <div className="border border-slate-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                <tr>
                  {['Mês','Pagos','Pendentes','Em Atraso','Total'].map((h,i) => (
                    <th key={h} className={`px-3 py-2 text-slate-500 font-semibold ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MONTHS_DATA.map((m, i) => (
                  <tr key={m.key} className={i === CURRENT_IDX ? 'bg-indigo-50' : 'hover:bg-slate-50'}>
                    <td className={`px-3 py-2 font-medium ${i === CURRENT_IDX ? 'text-indigo-700' : 'text-slate-700'}`}>{m.label}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{fmt(m.paidVal)}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{fmt(m.pendingVal)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(m.overdueVal)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(m.paidVal+m.pendingVal+m.overdueVal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Dashboard() {
  const [monthIdx, setMonthIdx] = useState(CURRENT_IDX)
  const [yearView, setYearView] = useState(false)
  const [batch, setBatch]       = useState(false)

  const m         = MONTHS_DATA[monthIdx]
  const isCurrent = monthIdx === CURRENT_IDX

  const totalVal   = m.paidVal + m.pendingVal + m.overdueVal
  const totalCount = m.paid + m.pending + m.overdue

  const sparkPaid    = MONTHS_DATA.map(x => x.paidVal)
  const sparkPending = MONTHS_DATA.map(x => x.pendingVal + x.overdueVal)

  const expiring = useMemo(() => {
    if (!isCurrent) return []
    const now = new Date()
    return CONTRACTS.filter(c => {
      const diff = (new Date(c.end) - now) / 86400000
      return diff >= 0 && diff <= 30
    })
  }, [isCurrent])

  const overdueSample = useMemo(
    () => CONTRACTS.filter(c => c.status === 'Em Atraso').slice(0, 5),
    []
  )

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header + Navegação de meses ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{isCurrent ? 'Mês em curso' : monthIdx < CURRENT_IDX ? 'Histórico' : 'Projeção'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setMonthIdx(i => Math.max(0, i-1))} disabled={monthIdx === 0}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            <IcChevL c="w-4 h-4"/>
          </button>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 min-w-44 justify-center">
            <IcCalendar c="w-4 h-4 text-indigo-500"/>
            <span className="font-semibold text-slate-800 text-sm">{m.label}</span>
            {isCurrent && <span className="text-[10px] bg-indigo-100 text-indigo-600 font-bold px-1.5 py-0.5 rounded-full">ATUAL</span>}
          </div>

          <button onClick={() => setMonthIdx(i => Math.min(MONTHS_DATA.length-1, i+1))} disabled={monthIdx === MONTHS_DATA.length-1}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
            <IcChevR c="w-4 h-4"/>
          </button>

          <button onClick={() => setYearView(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-all">
            <IcGrid c="w-4 h-4 text-indigo-500"/> Visão Anual
          </button>

          {isCurrent && (
            <button onClick={() => setBatch(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200/50">
              <IcSend c="w-4 h-4"/> Gerar e Enviar Tudo
            </button>
          )}
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Receita Total</p>
          <p className="text-2xl font-bold mb-3">{fmt(totalVal)}</p>
          <div className="flex items-center justify-between">
            <p className="text-indigo-200 text-xs">{fmtN(totalCount)} contratos</p>
            <Sparkline data={sparkPaid.map((v,i) => v + sparkPending[i])} color="#c7d2fe"/>
          </div>
        </div>

        {[
          { label:'✅ Pagos',     val:m.paidVal,    count:m.paid,    color:'emerald', spark:sparkPaid,                                  scolor:'#10b981' },
          { label:'⏳ Pendentes', val:m.pendingVal,  count:m.pending, color:'amber',   spark:MONTHS_DATA.map(x=>x.pendingVal),            scolor:'#f59e0b' },
          { label:'🔴 Em Atraso', val:m.overdueVal,  count:m.overdue, color:'red',     spark:MONTHS_DATA.map(x=>x.overdueVal),            scolor:'#ef4444' },
        ].map(({ label, val, count, color, spark, scolor }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
                <p className="text-xl font-bold text-slate-900">{fmt(val)}</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmtN(count)} contratos</p>
              </div>
              <Sparkline data={spark} color={scolor}/>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full">
              <div className={`h-full bg-${color}-500 rounded-full`} style={{width:`${totalCount > 0 ? Math.round(count/totalCount*100) : 0}%`}}/>
            </div>
            <p className="text-xs text-slate-400 mt-1">{totalCount > 0 ? Math.round(count/totalCount*100) : 0}% do total</p>
          </div>
        ))}
      </div>

      {/* ── Barra de progresso geral ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold text-slate-900">Progresso de Recebimento</p>
            <p className="text-xs text-slate-400">{m.label}</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{totalVal > 0 ? Math.round((m.paidVal/totalVal)*100) : 0}%</p>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{width:`${totalVal > 0 ? (m.paidVal/totalVal*100) : 0}%`}}/>
          <div className="h-full bg-amber-400 transition-all" style={{width:`${totalVal > 0 ? (m.pendingVal/totalVal*100) : 0}%`}}/>
          <div className="h-full bg-red-500 transition-all" style={{width:`${totalVal > 0 ? (m.overdueVal/totalVal*100) : 0}%`}}/>
        </div>
        <div className="flex gap-4 mt-2 flex-wrap">
          {[['bg-emerald-500','Pagos',m.paid],['bg-amber-400','Pendentes',m.pending],['bg-red-500','Em Atraso',m.overdue]].map(([c,l,n])=>(
            <div key={l} className="flex items-center gap-1.5 text-xs text-slate-500">
              <div className={`w-2.5 h-2.5 rounded-full ${c}`}/>
              {l} <span className="font-medium text-slate-700">({fmtN(n)})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Painéis inferiores ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Histórico de envios */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcSend c="w-4 h-4 text-indigo-500"/>
            <h3 className="font-semibold text-slate-900 text-sm">Histórico de Envios</h3>
          </div>
          <div className="space-y-3">
            {SEND_LOGS.map(log => (
              <div key={log.id} className="flex items-start justify-between text-sm">
                <div>
                  <p className="text-slate-700 font-medium">{log.date}</p>
                  <p className="text-xs text-slate-400">{fmtN(log.total)} contratos</p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-600 font-semibold text-xs">{fmtN(log.success)} ✓</p>
                  {log.failed > 0 && <p className="text-red-500 text-xs">{log.failed} ✗</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Em atraso */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔴</span>
              <h3 className="font-semibold text-slate-900 text-sm">Em Atraso</h3>
            </div>
            <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full">{m.overdue} contratos</span>
          </div>
          {isCurrent && overdueSample.length > 0 ? (
            <div className="space-y-2.5">
              {overdueSample.map(c => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-red-700 text-xs font-bold flex-shrink-0">{c.tenant[0]}</div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 font-medium truncate">{c.tenant.split(' ')[0]}</p>
                      <p className="text-xs text-slate-400 truncate">{c.property.split('—')[0].trim()}</p>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-red-600 flex-shrink-0 ml-2">{fmt(c.totalValue)}</p>
                </div>
              ))}
              {m.overdue > 5 && <p className="text-xs text-slate-400 text-center pt-1">+{m.overdue - 5} outros em atraso</p>}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">
              {isCurrent ? '🎉 Nenhum contrato em atraso!' : `${m.overdue} contratos em atraso neste mês`}
            </p>
          )}
        </div>

        {/* Próximos vencimentos de contrato */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <IcCalendar c="w-4 h-4 text-amber-500"/>
            <h3 className="font-semibold text-slate-900 text-sm">Contratos Próximos de Vencer</h3>
          </div>
          {isCurrent && expiring.length > 0 ? (
            <div className="space-y-2.5">
              {expiring.slice(0,5).map(c => {
                const days = Math.ceil((new Date(c.end) - new Date()) / 86400000)
                return (
                  <div key={c.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold flex-shrink-0">{c.tenant[0]}</div>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 font-medium truncate">{c.tenant.split(' ')[0]}</p>
                        <p className="text-xs text-slate-400">vence em {days}d</p>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${days <= 7 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{days}d</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">
              {isCurrent ? 'Nenhum contrato vence nos próximos 30 dias' : 'Dados históricos'}
            </p>
          )}
        </div>
      </div>

      {yearView && <YearView onClose={() => setYearView(false)}/>}
      {batch    && <BatchModal month={m.label} onClose={() => setBatch(false)}/>}
    </div>
  )
}
