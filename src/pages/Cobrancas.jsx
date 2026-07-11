import { useState } from 'react'
import { KPI, SEND_LOGS, fmt, fmtN } from '../data/mockData'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcZap   = ({ c='' }) => ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', c)
const IcCheck = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)

// ── Batch Modal completo ──────────────────────────────────────────
function BatchModal({ onClose, onDone }) {
  const [step, setStep]         = useState('idle')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [fails, setFails]       = useState(0)
  const total = 600

  const run = () => {
    setStep('running')
    let sent = 0, fc = 0
    const names = [
      'Maria Aparecida Silva','João Carlos Santos','Ana Paula Rodrigues',
      'Carlos Eduardo Becker','Fernanda Oliveira Souza','Roberto Alves Pereira',
    ]
    const iv = setInterval(() => {
      const batch = Math.min(10, total - sent)
      for (let i = 0; i < batch; i++) {
        const fail = [87,231,445,578].includes(sent + i)
        if (fail) fc++
        setLogs(l => [...l.slice(-60), { name: names[(sent+i) % names.length], ok: !fail }])
      }
      sent = Math.min(sent + batch, total)
      setProgress(sent)
      setFails(fc)
      if (sent >= total) {
        clearInterval(iv)
        setTimeout(() => {
          setStep('done')
          onDone({ total, success: total - fc, failed: fc })
        }, 500)
      }
    }, 80)
  }

  const pct = Math.round((progress / total) * 100)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {step === 'idle' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Gerar e Enviar em Massa</h2>
            <p className="text-sm text-slate-500 mb-4">
              Para <strong className="text-slate-700">{fmtN(total)} contratos ativos</strong>, a plataforma irá:
            </p>
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2.5">
              {[
                ['💳','Gerar boleto de cobrança','via OpenPIX / Banco Inter'],
                ['📄','Emitir Nota Fiscal de Serviço (NFS-e)','via API Nacional gov.br'],
                ['📧','Enviar e-mail com ambos os documentos','para cada inquilino'],
              ].map(([ico,txt,sub])=>(
                <div key={txt} className="flex items-start gap-3 text-sm">
                  <span className="text-lg leading-none mt-0.5">{ico}</span>
                  <div>
                    <span className="font-medium text-slate-800">{txt}</span>
                    <span className="text-slate-400 ml-2 text-xs">{sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-700">
              <span className="mt-0.5">⚠️</span>
              <span>Mês de referência: <strong>Julho/2026</strong>. Contratos já emitidos serão ignorados.</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={run} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 flex items-center justify-center gap-2 shadow-md shadow-indigo-200">
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
                <span className="text-slate-600">
                  {progress.toLocaleString('pt-BR')} <span className="text-slate-400">de {total.toLocaleString('pt-BR')}</span>
                </span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-100" style={{width:`${pct}%`}}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-52 overflow-y-auto font-mono text-xs space-y-1">
              {logs.slice(-40).map((l,i) => (
                <div key={i} className={l.ok ? 'text-emerald-400' : 'text-red-400'}>
                  {l.ok ? '✓' : '✗'}{' '}
                  {l.ok
                    ? `Boleto · NFS-e · e-mail enviados para ${l.name}`
                    : `Falha ao enviar para ${l.name} · timeout API NFS-e`}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="p-7 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Processamento Concluído!</h2>
            <p className="text-slate-400 text-sm mb-5">Julho/2026 · {new Date().toLocaleString('pt-BR')}</p>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[
                { v: fmtN(total),          l:'Total',  bg:'bg-slate-50',   c:'text-slate-800' },
                { v: fmtN(total - fails),  l:'Sucesso',bg:'bg-emerald-50', c:'text-emerald-700' },
                { v: String(fails),        l:'Falhas', bg:'bg-red-50',     c:'text-red-600' },
              ].map(({v,l,bg,c}) => (
                <div key={l} className={`${bg} rounded-xl py-3`}>
                  <p className={`text-2xl font-bold ${c}`}>{v}</p>
                  <p className={`text-xs ${c} opacity-70 mt-0.5`}>{l}</p>
                </div>
              ))}
            </div>
            {fails > 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5 mb-5">
                {fails} contrato(s) com falha por timeout. Use o reenvio individual para corrigir.
              </p>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────
export default function Cobrancas() {
  const [showBatch, setShowBatch] = useState(false)
  const [logs, setLogs]           = useState(SEND_LOGS)

  const handleDone = ({ total, success, failed }) => {
    const now = new Date()
    const date = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    setLogs(l => [{ id: Date.now(), date, total, success, failed }, ...l])
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Disparo em Massa</h1>
          <p className="text-sm text-slate-500">Gere e envie boletos + NFS-e para todos os contratos ativos</p>
        </div>
        <button onClick={() => setShowBatch(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 shadow-lg shadow-indigo-200 transition-all">
          <IcZap c="w-4 h-4"/> Gerar e Enviar Tudo
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { ico:'📋', label:'Contratos ativos',      value: fmtN(600),        color:'text-indigo-600' },
          { ico:'💰', label:'Valor total estimado',  value: fmt(KPI.totalVal), color:'text-emerald-600' },
          { ico:'⚡', label:'Taxa por boleto',       value: 'R$ 1,20',        color:'text-amber-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-100 p-5 text-center">
            <span className="text-2xl mb-2 block">{c.ico}</span>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Log de envios */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Histórico de Envios</h2>
          <p className="text-xs text-slate-400 mt-0.5">Registro de todos os disparos em lote realizados</p>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📭</p>
            <p className="text-slate-500 font-medium">Nenhum envio realizado ainda</p>
            <p className="text-sm text-slate-400 mt-1">Clique em "Gerar e Enviar Tudo" para começar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Data / Hora','Total','Sucesso','Falhas','Resultado'].map((h,i) => (
                  <th key={h} className={`px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide ${i===0||i===4?'text-left':'text-center'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900">{l.date}</p>
                  </td>
                  <td className="px-5 py-4 text-center font-semibold text-slate-800">{fmtN(l.total)}</td>
                  <td className="px-5 py-4 text-center font-semibold text-emerald-600">{fmtN(l.success)}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`font-semibold ${l.failed > 0 ? 'text-red-500' : 'text-slate-300'}`}>{l.failed}</span>
                  </td>
                  <td className="px-5 py-4">
                    {l.failed === 0
                      ? <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"/>Concluído sem falhas</span>
                      : <span className="inline-flex items-center gap-1.5 text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"/>Concluído com {l.failed} falha(s)</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBatch && <BatchModal onClose={() => setShowBatch(false)} onDone={handleDone}/>}
    </div>
  )
}
