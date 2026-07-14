import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { emitirCobrancas, mesLabel, mesStr, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcZap     = ({ c='' }) => ic('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', c)
const IcCheck   = ({ c='' }) => ic('<polyline points="20 6 9 17 4 12"/>', c)
const IcRefresh = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', c)
const IcQR      = ({ c='' }) => ic('<rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1"/><rect x="4" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/><path d="M2 14h4v2H2zM6 14v4h4M2 20h4"/>', c)
const IcCopy    = ({ c='' }) => ic('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', c)
const IcClose   = ({ c='' }) => ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', c)
const IcReceipt = ({ c='' }) => ic('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="11" y2="18"/>', c)

const fmt   = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtCi = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

const STATUS_CFG = {
  'Pago':      { bg:'bg-emerald-100', text:'text-emerald-700', dot:'bg-emerald-500' },
  'Pendente':  { bg:'bg-amber-100',   text:'text-amber-700',   dot:'bg-amber-400'   },
  'Em Atraso': { bg:'bg-red-100',     text:'text-red-700',     dot:'bg-red-500'     },
}

const FILTERS = ['Todos', 'Pago', 'Pendente', 'Em Atraso']

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
function refLabel(mesRef) {
  if (!mesRef) return '—'
  const [year, month] = mesRef.split('-')
  return `${MESES_ABREV[parseInt(month, 10) - 1]}/${year}`
}

// ── Calcula data de vencimento (YYYY-MM-DD) ──────────────────────
function calcDueDate(mesRef, dueDay) {
  if (!mesRef || !dueDay) return null
  const [year, month] = mesRef.split('-')
  return `${year}-${month}-${String(dueDay).padStart(2, '0')}`
}

// ── Calcula expiresIn (segundos) para o QR Code expirar na data de
//    vencimento + 3 dias de carência. Bancos que suportam agendamento
//    de pagamento PIX usam este prazo para exibir a opção ao pagador.
function calcExpiresIn(mesRef, dueDay) {
  const iso = calcDueDate(mesRef, dueDay)
  if (!iso) return 30 * 24 * 3600
  const due = new Date(iso + 'T23:59:59')
  const secs = Math.floor((due - Date.now()) / 1000)
  // mínimo 3 dias; vencimento futuro recebe +3 dias de carência
  return Math.max(3 * 24 * 3600, secs + 3 * 24 * 3600)
}

// Formata data YYYY-MM-DD para dd/mm/aaaa
function fmtDate(iso) {
  if (!iso) return '—'
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR')
}

// ── Mapeia linha do banco ─────────────────────────────────────────
const mapCob = row => ({
  id:              row.id,
  tenant:          row.inquilinos?.nome    || '—',
  cpf:             row.inquilinos?.cpf     || '',
  email:           row.inquilinos?.email   || '',
  property:        row.contratos?.imovel   || '—',
  totalValue:      Number(row.valor_total) || 0,
  value:           Number(row.valor_aluguel) || 0,
  seguroFinanceiro:Number(row.contratos?.seguro_financeiro) || 0,
  seguroIncendio:  Number(row.contratos?.seguro_incendio)   || 0,
  iptu:            Number(row.contratos?.iptu)              || 0,
  dueDay:          row.dia_vencimento,
  status:          row.status || 'Pendente',
  mesRef:          row.mes_referencia,
  emissao:         row.data_emissao,
})

// ── Modal de Cobrança (QR Code de Pagamento) ─────────────────────
// Retorna a próxima data futura com o mesmo dia de vencimento (YYYY-MM-DD)
function nextFutureDue(dueDay) {
  const today = new Date()
  const d = parseInt(dueDay, 10)
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), d)
  if (thisMonth > today) return thisMonth.toISOString().slice(0, 10)
  return new Date(today.getFullYear(), today.getMonth() + 1, d).toISOString().slice(0, 10)
}

function BoletoPIXModal({ cob, pixKey, onClose }) {
  // loading | confirm_date | ok | error | noPix
  const [state, setState]           = useState('loading')
  const [chargeData, setChargeData] = useState(null)
  const [errMsg, setErrMsg]         = useState('')
  const [copied, setCopied]         = useState(false)
  const [overrideDue, setOverrideDue] = useState('') // YYYY-MM-DD escolhido pelo usuário

  useEffect(() => {
    if (state === 'loading') return
    const handle = e => { if (e.key === 'Escape' && state !== 'loading') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, state])

  useEffect(() => {
    if (!pixKey) { setState('noPix'); return }

    // ── Verificar se a data de vencimento já passou ──────────────────
    const dueIso = calcDueDate(cob.mesRef, cob.dueDay)
    if (dueIso && new Date(dueIso + 'T23:59:59') < new Date()) {
      // Pré-preenche com a próxima ocorrência futura do mesmo dia
      setOverrideDue(nextFutureDue(cob.dueDay))
      setState('confirm_date')
      return
    }

    generate()
  }, [])

  // customDue: YYYY-MM-DD opcional (usado na repactuação)
  const generate = async (customDue = null) => {
    setState('loading')
    setErrMsg('')

    const additionalInfo = []
    if (cob.value > 0)            additionalInfo.push({ key: 'Aluguel',           value: fmtCi(cob.value) })
    if (cob.seguroFinanceiro > 0) additionalInfo.push({ key: 'Seguro Financeiro', value: fmtCi(cob.seguroFinanceiro) })
    if (cob.seguroIncendio   > 0) additionalInfo.push({ key: 'Seguro Incendio',   value: fmtCi(cob.seguroIncendio) })
    if (cob.iptu             > 0) additionalInfo.push({ key: 'IPTU',              value: fmtCi(cob.iptu) })
    additionalInfo.push({ key: 'Total', value: fmtCi(cob.totalValue) })

    const comment = [
      `Aluguel ref. ${refLabel(cob.mesRef)}`,
      cob.property ? `- ${cob.property}` : '',
    ].filter(Boolean).join(' ').replace(/[^\x00-\x7F]/g, '')

    // Calcula expiresIn com base na data efetiva (original ou repactuada)
    const effectiveDue = customDue || calcDueDate(cob.mesRef, cob.dueDay)
    let expiresIn
    if (effectiveDue) {
      const due = new Date(effectiveDue + 'T23:59:59')
      const secs = Math.floor((due - Date.now()) / 1000)
      expiresIn = Math.max(3 * 24 * 3600, secs + 3 * 24 * 3600)
    } else {
      expiresIn = 30 * 24 * 3600
    }

    try {
      const res = await fetch('/.netlify/functions/openpix-create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value:         Math.round(cob.totalValue * 100),
          correlationID: cob.id,
          comment,
          additionalInfo,
          clientPixKey:  pixKey,
          expiresIn,
        }),
      })

      const raw = await res.text()
      let data
      try { data = JSON.parse(raw) } catch {
        setErrMsg(
          res.status === 404
            ? 'Funcao nao encontrada. Rode "netlify dev" para testar localmente.'
            : `Resposta inesperada (${res.status}): ${raw.slice(0, 120)}`
        )
        setState('error')
        return
      }

      if (!res.ok || data.error) { setErrMsg(data.error || 'Erro ao gerar cobranca'); setState('error'); return }
      setChargeData(data)
      setState('ok')
    } catch (err) {
      setErrMsg(err.message)
      setState('error')
    }
  }

  const copy = () => {
    if (!chargeData?.brCode) return
    navigator.clipboard.writeText(chargeData.brCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Usa a data efetiva para o label de vencimento na tela de sucesso
  const effectiveDueLabel = fmtDate(overrideDue || calcDueDate(cob.mesRef, cob.dueDay))
  const todayIso = new Date().toISOString().slice(0, 10)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-lg">💳</div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Cobrança</p>
              <p className="text-xs text-slate-400">{cob.tenant} · {refLabel(cob.mesRef)}</p>
            </div>
          </div>
          {state !== 'loading' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <IcClose c="w-4 h-4"/>
            </button>
          )}
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/>
            <p className="text-sm text-slate-500">Gerando cobrança…</p>
          </div>
        )}

        {/* Vencimento vencido — pede nova data antes de gerar */}
        {state === 'confirm_date' && (
          <div className="p-5 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">Vencimento expirado</p>
              <p className="text-xs text-amber-600 mt-1">
                O vencimento original ({fmtDate(calcDueDate(cob.mesRef, cob.dueDay))}) já passou.
                Informe a nova data antes de gerar a cobrança.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Nova data de vencimento</label>
              <input
                type="date"
                value={overrideDue}
                min={todayIso}
                onChange={e => setOverrideDue(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <p className="text-xs text-slate-400 mt-1">
                Sugerido: {fmtDate(nextFutureDue(cob.dueDay))} (próximo vencimento dia {cob.dueDay})
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={() => overrideDue && generate(overrideDue)}
                disabled={!overrideDue}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-40">
                Confirmar e Gerar
              </button>
            </div>
          </div>
        )}

        {/* Sem chave PIX */}
        {state === 'noPix' && (
          <div className="p-6 text-center">
            <p className="text-4xl mb-3">🔑</p>
            <p className="font-semibold text-slate-800 mb-1">Chave PIX não configurada</p>
            <p className="text-sm text-slate-500 mb-4">Configure sua chave PIX em <strong>Configurações → Integrações</strong>.</p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm">Fechar</button>
          </div>
        )}

        {/* Erro */}
        {state === 'error' && (
          <div className="p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="font-semibold text-slate-800 mb-1">Erro ao gerar cobrança</p>
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3 mb-4">{errMsg}</p>
            <div className="flex gap-3">
              <button onClick={() => generate(overrideDue || null)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm">Tentar novamente</button>
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm">Fechar</button>
            </div>
          </div>
        )}

        {/* Sucesso */}
        {state === 'ok' && chargeData && (
          <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

            {/* Vencimento efetivo */}
            {effectiveDueLabel && effectiveDueLabel !== '—' && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                <span className="text-xs font-semibold text-amber-700">Vencimento</span>
                <span className="text-sm font-bold text-amber-800">{effectiveDueLabel}</span>
              </div>
            )}

            {/* QR Code */}
            {chargeData.brCode && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-xs font-semibold text-slate-400 self-start">CÓDIGO DE PAGAMENTO</p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=192x192&data=${encodeURIComponent(chargeData.brCode)}`}
                  alt="QR Code"
                  className="w-48 h-48 rounded-2xl border border-slate-100 shadow-sm"
                />
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-slate-600 font-mono break-all leading-relaxed">{chargeData.brCode.slice(0, 60)}…</p>
                  <button onClick={copy}
                    className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-all ${
                      copied ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
                    <IcCopy c="w-3 h-3"/>
                    {copied ? '✓ Copiado!' : 'Copiar código'}
                  </button>
                </div>
              </div>
            )}

            {/* Discriminativo */}
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1.5">COMPOSIÇÃO DO VALOR</p>
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                {cob.value > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Aluguel</span><span className="font-medium">{fmt(cob.value)}</span>
                  </div>
                )}
                {cob.seguroFinanceiro > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Seguro Financeiro</span><span className="font-medium">{fmt(cob.seguroFinanceiro)}</span>
                  </div>
                )}
                {cob.seguroIncendio > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Seguro Incêndio</span><span className="font-medium">{fmt(cob.seguroIncendio)}</span>
                  </div>
                )}
                {cob.iptu > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>IPTU</span><span className="font-medium">{fmt(cob.iptu)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1.5 mt-1 flex justify-between font-bold text-slate-800">
                  <span>Total</span><span>{fmt(cob.totalValue)}</span>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-slate-400">
              Taxa NotaFacil: {fmt((chargeData.fee || 299) / 100)} · Você recebe {fmt((chargeData.clientSplit || 0) / 100)} após compensação
            </p>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Modal de emissão de NFS-e ─────────────────────────────────────
function NfseModal({ cob, user, onClose }) {
  const [state, setState]       = useState('idle') // idle | loading | ok | error
  const [result, setResult]     = useState(null)
  const [errMsg, setErrMsg]     = useState('')
  const [homolog, setHomolog]   = useState(false)

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape' && state !== 'loading') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, state])

  const emitir = async () => {
    setState('loading')
    setErrMsg('')
    try {
      const res = await fetch('/.netlify/functions/nfse-emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId:     user.id,
          cobId:      cob.id,
          homologacao: homolog,
          cobData: {
            mesRef:           cob.mesRef,
            tenant:           cob.tenant,
            cpf:              cob.cpf,
            email:            cob.email,
            property:         cob.property,
            totalValue:       cob.totalValue,
            value:            cob.value,
            seguroFinanceiro: cob.seguroFinanceiro,
            seguroIncendio:   cob.seguroIncendio,
            iptu:             cob.iptu,
          },
        }),
      })

      const raw = await res.text()
      let data
      try { data = JSON.parse(raw) } catch {
        setErrMsg(res.status === 404 ? 'Função não encontrada (rode netlify dev).' : `Resposta inesperada (${res.status}): ${raw.slice(0,120)}`)
        setState('error')
        return
      }

      if (!res.ok || data.error) {
        setErrMsg(data.error || data.detail || `Erro HTTP ${res.status}`)
        setState('error')
        return
      }

      setResult(data)
      setState('ok')
    } catch (err) {
      setErrMsg(err.message)
      setState('error')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-lg">📋</div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Emitir NFS-e</p>
              <p className="text-xs text-slate-400">{cob.tenant} · {refLabel(cob.mesRef)}</p>
            </div>
          </div>
          {state !== 'loading' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <IcClose c="w-4 h-4"/>
            </button>
          )}
        </div>

        {/* Idle — confirmação */}
        {state === 'idle' && (
          <div className="p-5 space-y-4">
            <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1.5 text-sm">
              {cob.value > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Aluguel</span><span className="font-medium">{fmt(cob.value)}</span>
                </div>
              )}
              {cob.seguroFinanceiro > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Seguro Financeiro</span><span className="font-medium">{fmt(cob.seguroFinanceiro)}</span>
                </div>
              )}
              {cob.seguroIncendio > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Seguro Incêndio</span><span className="font-medium">{fmt(cob.seguroIncendio)}</span>
                </div>
              )}
              {cob.iptu > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>IPTU</span><span className="font-medium">{fmt(cob.iptu)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-1.5 mt-1 flex justify-between font-bold text-slate-800">
                <span>Total</span><span>{fmt(cob.totalValue)}</span>
              </div>
            </div>

            {/* Toggle de ambiente */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div className={`w-9 h-5 rounded-full transition-colors relative ${homolog ? 'bg-amber-400' : 'bg-slate-200'}`}
                onClick={() => setHomolog(v => !v)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${homolog ? 'translate-x-4' : 'translate-x-0.5'}`}/>
              </div>
              <span className="text-xs font-medium text-slate-600">
                {homolog ? '⚠️ Homologação (teste)' : '✅ Produção'}
              </span>
            </label>
            {homolog && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Ambiente de teste — a NFS-e não terá validade fiscal.
              </p>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">Cancelar</button>
              <button onClick={emitir}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 flex items-center justify-center gap-2">
                <IcReceipt c="w-4 h-4"/> Emitir NFS-e
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"/>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Emitindo NFS-e…</p>
              <p className="text-xs text-slate-400 mt-1">Assinando e enviando ao SEFIN Nacional</p>
            </div>
          </div>
        )}

        {/* Erro */}
        {state === 'error' && (
          <div className="p-6 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="font-semibold text-slate-800 mb-1">Erro na emissão</p>
            <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4 text-left">{errMsg}</p>
            <div className="flex gap-3">
              <button onClick={emitir} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm">Tentar novamente</button>
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm">Fechar</button>
            </div>
          </div>
        )}

        {/* Sucesso */}
        {state === 'ok' && result && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-emerald-800 text-sm">NFS-e emitida com sucesso!</p>
                {result.numeroNfse && (
                  <p className="text-xs text-emerald-600">Número: {result.numeroNfse}</p>
                )}
              </div>
            </div>

            {result.chaveAcesso && (
              <div>
                <p className="text-xs font-semibold text-slate-400 mb-1">CHAVE DE ACESSO</p>
                <p className="text-xs text-slate-600 font-mono bg-slate-50 rounded-xl px-3 py-2 break-all">{result.chaveAcesso}</p>
              </div>
            )}

            <div className="text-xs text-slate-400 text-center">
              DPS nº {result.numeroDps} · {refLabel(cob.mesRef)} · {fmt(cob.totalValue)}
            </div>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Opções de ação no BatchModal ──────────────────────────────────
const BATCH_ACTIONS = [
  { id: 'boleto', label: 'Somente Cobranças', icon: '💳', desc: 'Gera e registra cobranças para cada inquilino' },
  { id: 'nfse',   label: 'Somente NFS-e',    icon: '📄', desc: 'Emite notas fiscais de serviço (em breve)' },
  { id: 'ambos',  label: 'Cobrança + NFS-e', icon: '⚡', desc: 'Gera cobrança e emite NFS-e juntos (em breve)' },
]

// ── Modal Gerar e Enviar em Massa ─────────────────────────────────
function BatchModal({ contracts, user, pixKey, mesRef: initialMes, onClose, onDone }) {
  const [step, setStep]         = useState('pick')
  const [action, setAction]     = useState('boleto')
  const [mesRef, setMesRef]     = useState(initialMes)
  const [preview, setPreview]   = useState(null)
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [result, setResult]     = useState(null)

  useEffect(() => {
    if (!user || !contracts.length) return
    setPreview(null)
    const ref = mesStr(mesRef)
    supabase.from('cobrancas').select('contrato_id')
      .eq('user_id', user.id).eq('mes_referencia', ref)
      .then(({ data }) => {
        const ids = new Set((data || []).map(e => e.contrato_id))
        const toCreate = contracts.filter(c => !ids.has(c.id)).length
        setPreview({ toCreate, skipped: contracts.length - toCreate })
      })
  }, [mesRef, user, contracts])

  useEffect(() => {
    if (step === 'running') return
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose, step])

  const selectedAction = BATCH_ACTIONS.find(a => a.id === action)
  const needsPix = action === 'boleto' || action === 'ambos'
  const canConfirm = preview && preview.toCreate > 0 && !(needsPix && !pixKey)

  const confirm = async () => {
    setStep('running')
    setProgress(0)
    setLogs([])

    const res = await emitirCobrancas(user.id, contracts, mesRef)

    if (res.error || res.created === 0) {
      setResult({ ...res, fails: 0 })
      setStep('done')
      return
    }

    const total  = res.created
    const names  = contracts.map(c => c.tenant?.split(' ')[0]).filter(Boolean)
    let sent     = 0
    let boletosFails = 0

    // Gera boletos PIX para cada cobrança criada (se ação inclui boleto)
    if (needsPix && pixKey && res.createdIds?.length) {
      for (const cob of res.createdIds) {
        try {
          const linhas = []
          if ((cob.value || 0) > 0)            linhas.push(`Aluguel ${fmtCi(cob.value)}`)
          if ((cob.seguroFinanceiro || 0) > 0)  linhas.push(`Seg.Fin ${fmtCi(cob.seguroFinanceiro)}`)
          if ((cob.seguroIncendio || 0) > 0)    linhas.push(`Seg.Inc ${fmtCi(cob.seguroIncendio)}`)
          if ((cob.iptu || 0) > 0)              linhas.push(`IPTU ${fmtCi(cob.iptu)}`)
          linhas.push(`Total ${fmtCi(cob.totalValue)}`)
          linhas.push(`Ref: ${refLabel(cob.mesRef)}`)

          await fetch('/.netlify/functions/openpix-create-charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              value:         Math.round((cob.totalValue || 0) * 100),
              correlationID: cob.id,
              comment:       linhas.join(' | '),
              clientPixKey:  pixKey,
              expiresIn:     2592000,
            }),
          })
        } catch { boletosFails++ }
        await new Promise(r => setTimeout(r, 120))
      }
    }

    const iv = setInterval(() => {
      const batch = Math.min(3, total - sent)
      for (let i = 0; i < batch; i++) {
        const name = names[(sent + i) % (names.length || 1)] || 'Inquilino'
        setLogs(l => [...l.slice(-50), { name }])
      }
      sent = Math.min(sent + batch, total)
      setProgress(sent)
      if (sent >= total) {
        clearInterval(iv)
        setTimeout(() => {
          setResult({ created: total, skipped: res.skipped, fails: boletosFails, error: null })
          setStep('done')
          onDone()
        }, 400)
      }
    }, 160)
  }

  const pct = result?.created > 0 ? Math.round((progress / result.created) * 100) : 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {step === 'pick' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Gerar e Enviar em Massa</h2>
            <p className="text-sm text-slate-500 mb-4">Selecione o mês e o que deseja gerar:</p>

            <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setPreview(null) }}/>

            {/* Seleção de ação */}
            <div className="mt-4 space-y-2">
              {BATCH_ACTIONS.map(a => (
                <button key={a.id} onClick={() => setAction(a.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    action === a.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                  <span className="text-xl">{a.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${action === a.id ? 'text-indigo-800' : 'text-slate-700'}`}>{a.label}</p>
                    <p className={`text-xs mt-0.5 ${action === a.id ? 'text-indigo-500' : 'text-slate-400'}`}>{a.desc}</p>
                  </div>
                  {action === a.id && (
                    <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                      <IcCheck c="w-3 h-3 text-white stroke-[3]"/>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Aviso se sem chave PIX */}
            {needsPix && !pixKey && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                ⚠️ Configure sua chave PIX de recebimento em <strong>Configurações → Integrações</strong> antes de gerar cobranças.
              </div>
            )}

            {/* Preview */}
            {preview ? (
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                preview.toCreate > 0
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                {preview.toCreate > 0
                  ? <><strong>{preview.toCreate}</strong> cobrança{preview.toCreate !== 1 ? 's' : ''} serão geradas.
                      {preview.skipped > 0 && <span className="text-indigo-500 ml-1">({preview.skipped} já emitidas — ignoradas)</span>}</>
                  : <>⚠️ Todos os contratos já têm cobrança emitida para {mesLabel(mesRef)}.</>
                }
              </div>
            ) : (
              <div className="mt-3 h-10 flex items-center justify-center text-xs text-slate-300">
                <div className="w-3 h-3 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin mr-2"/>
                Verificando…
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={confirm} disabled={!canConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed">
                <span>{selectedAction?.icon}</span> Confirmar
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
                <p className="font-bold text-slate-900">Processando {mesLabel(mesRef)}…</p>
                <p className="text-sm text-slate-400">Não feche esta janela</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">{progress} <span className="text-slate-400">de {result?.created ?? '…'}</span></span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all" style={{ width:`${pct}%` }}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-44 overflow-y-auto font-mono text-xs space-y-1">
              {logs.slice(-30).map((l, i) => (
                <div key={i} className="text-emerald-400">✓ Cobrança registrada para {l.name}</div>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="p-7 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Processamento Concluído!</h2>
            <p className="text-slate-400 text-sm mb-5 capitalize">{mesLabel(mesRef)}</p>
            {result?.error ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-5">{result.error}</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { v: result?.created ?? 0, l:'Geradas',   bg:'bg-emerald-50', c:'text-emerald-700' },
                  { v: result?.skipped ?? 0, l:'Ignoradas', bg:'bg-slate-50',   c:'text-slate-600'   },
                  { v: result?.fails   ?? 0, l:'Falhas',    bg:'bg-red-50',     c:'text-red-600'     },
                ].map(({ v, l, bg, c }) => (
                  <div key={l} className={`${bg} rounded-xl py-3`}>
                    <p className={`text-2xl font-bold ${c}`}>{v}</p>
                    <p className={`text-xs ${c} opacity-70 mt-0.5`}>{l}</p>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Fechar</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG['Pendente']
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {status}
    </span>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Cobrancas() {
  const { user }  = useAuth()
  const [mesRef, setMesRef]       = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [cobrancas, setCobrancas] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('Todos')
  const [showBatch, setShowBatch] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [pixKey, setPixKey]       = useState(null)
  const [boletoCob, setBoletoCob] = useState(null)
  const [nfseCob, setNfseCob]     = useState(null) // cobrança selecionada para NFS-e

  // Carrega chave PIX do perfil
  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('pix_key_recebimento').eq('id', user.id).single()
      .then(({ data }) => setPixKey(data?.pix_key_recebimento || null))
  }, [user])

  // ── Carrega cobranças do mês ──────────────────────────────────
  const load = async () => {
    if (!user) return
    setLoading(true)
    const ref = mesStr(mesRef)

    const { data, error } = await supabase
      .from('cobrancas')
      .select('*, contratos(imovel, seguro_financeiro, seguro_incendio, iptu), inquilinos(nome, cpf, email)')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref)
      .order('created_at', { ascending: false })

    if (!error) setCobrancas((data || []).map(mapCob))

    const { data: ctrs } = await supabase
      .from('contratos')
      .select('id, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, inquilinos(nome)')
      .eq('user_id', user.id)

    setContracts((ctrs || []).map(r => ({
      id:               r.id,
      inquilino_id:     r.inquilino_id,
      tenant:           r.inquilinos?.nome || '',
      value:            Number(r.valor_aluguel)     || 0,
      seguroFinanceiro: Number(r.seguro_financeiro) || 0,
      seguroIncendio:   Number(r.seguro_incendio)   || 0,
      iptu:             Number(r.iptu)              || 0,
      dueDay:           r.dia_vencimento,
      totalValue:       (Number(r.valor_aluguel)||0) + (Number(r.seguro_financeiro)||0) +
                        (Number(r.seguro_incendio)||0) + (Number(r.iptu)||0),
    })))

    setLoading(false)
  }

  useEffect(() => { load() }, [user, mesRef])

  // ── KPIs ───────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const sum = (list, k = 'totalValue') => list.reduce((s, c) => s + c[k], 0)
    const byStatus = s => cobrancas.filter(c => c.status === s)
    const pagos    = byStatus('Pago')
    const pendentes = byStatus('Pendente')
    const atraso   = byStatus('Em Atraso')
    return {
      total:      cobrancas.length,
      totalVal:   sum(cobrancas),
      pagos:      pagos.length,    pagosVal:    sum(pagos),
      pendentes:  pendentes.length, pendentesVal: sum(pendentes),
      atraso:     atraso.length,   atrasoVal:   sum(atraso),
    }
  }, [cobrancas])

  // ── Filtro ─────────────────────────────────────────────────────
  const lista = useMemo(
    () => filter === 'Todos' ? cobrancas : cobrancas.filter(c => c.status === filter),
    [cobrancas, filter]
  )

  // ── Atualizar status ───────────────────────────────────────────
  const updateStatus = async (id, newStatus) => {
    setUpdatingId(id)
    const extra = newStatus === 'Pago' ? { data_pagamento: new Date().toISOString() } : {}
    await supabase.from('cobrancas').update({ status: newStatus, ...extra }).eq('id', id)
    setCobrancas(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
    setUpdatingId(null)
  }

  const currentMonth = `${MESES[mesRef.getMonth()]} / ${mesRef.getFullYear()}`

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Cobranças</h1>
          <p className="text-sm text-slate-500 capitalize">
            {loading ? 'Carregando…' : `${kpi.total} cobrança${kpi.total !== 1 ? 's' : ''} · ${currentMonth}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setFilter('Todos') }}/>
          <button onClick={load} disabled={loading} title="Atualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          </button>
          <button onClick={() => setShowBatch(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2.5 rounded-xl font-semibold text-sm hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-200 whitespace-nowrap">
            <IcZap c="w-4 h-4"/> Gerar e Enviar Tudo
          </button>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Emitido</p>
          <p className="text-2xl font-bold">{fmt(kpi.totalVal)}</p>
          <p className="text-indigo-200 text-xs mt-1">{kpi.total} cobrança{kpi.total !== 1 ? 's' : ''}</p>
        </div>
        {[
          { label:'✅ Pagos',      val: kpi.pagosVal,    count: kpi.pagos,     color:'emerald', text:'text-emerald-600' },
          { label:'⏳ Pendentes',  val: kpi.pendentesVal, count: kpi.pendentes, color:'amber',   text:'text-amber-600'  },
          { label:'🔴 Em Atraso',  val: kpi.atrasoVal,   count: kpi.atraso,    color:'red',     text:'text-red-600'    },
        ].map(({ label, val, count, color, text }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{count} cobrança{count !== 1 ? 's' : ''}</p>
            <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className={`h-full bg-${color}-500 rounded-full`}
                style={{ width:`${kpi.total > 0 ? Math.round(count/kpi.total*100) : 0}%` }}/>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filtros ────────────────────────────────────────── */}
      <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 w-fit">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* ── Tabela ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
            Carregando cobranças…
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">📭</p>
            <p className="text-slate-500 font-medium text-sm">
              {cobrancas.length === 0
                ? `Nenhuma cobrança emitida para ${currentMonth}`
                : `Nenhuma cobrança ${filter.toLowerCase()} em ${currentMonth}`}
            </p>
            {cobrancas.length === 0 && (
              <button onClick={() => setShowBatch(true)}
                className="mt-4 text-indigo-600 text-sm font-semibold hover:underline">
                + Gerar cobranças para este mês
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Inquilino</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Imóvel</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Venc.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Valor</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lista.map(c => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                        {c.tenant[0]?.toUpperCase() || '?'}
                      </div>
                      <p className="font-medium text-slate-800">{c.tenant}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell max-w-xs truncate">{c.property}</td>
                  <td className="px-5 py-3.5 text-center text-slate-500 hidden lg:table-cell">
                    {c.dueDay ? `Dia ${c.dueDay}` : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-700">{fmt(c.totalValue)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <StatusBadge status={c.status}/>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {updatingId === c.id ? (
                      <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin inline-block"/>
                    ) : (
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {/* Gerar Cobrança — apenas para cobranças não pagas */}
                        {c.status !== 'Pago' && (
                          <button onClick={() => setBoletoCob(c)}
                            className="flex items-center gap-1 text-xs text-indigo-600 font-semibold border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors">
                            <IcQR c="w-3 h-3"/>
                            Gerar Cobrança
                          </button>
                        )}

                        {/* Emitir NFS-e */}
                        <button onClick={() => setNfseCob(c)}
                          className="flex items-center gap-1 text-xs text-emerald-700 font-semibold border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors">
                          <IcReceipt c="w-3 h-3"/>
                          Emitir NFS-e
                        </button>

                        {c.status === 'Pago' ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <>
                            <button onClick={() => updateStatus(c.id, 'Pago')}
                              className="text-xs text-emerald-600 font-semibold hover:underline whitespace-nowrap">
                              ✓ Marcar Pago
                            </button>
                            {c.status === 'Pendente' && (
                              <button onClick={() => updateStatus(c.id, 'Em Atraso')}
                                className="text-xs text-red-500 font-semibold hover:underline whitespace-nowrap">
                                Em Atraso
                              </button>
                            )}
                            {c.status === 'Em Atraso' && (
                              <button onClick={() => updateStatus(c.id, 'Pendente')}
                                className="text-xs text-amber-600 font-semibold hover:underline whitespace-nowrap">
                                Pendente
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modais ─────────────────────────────────────────── */}
      {showBatch && (
        <BatchModal
          contracts={contracts}
          user={user}
          pixKey={pixKey}
          mesRef={mesRef}
          onClose={() => setShowBatch(false)}
          onDone={load}
        />
      )}

      {boletoCob && (
        <BoletoPIXModal
          cob={boletoCob}
          pixKey={pixKey}
          onClose={() => setBoletoCob(null)}
        />
      )}

      {nfseCob && (
        <NfseModal
          cob={nfseCob}
          user={user}
          onClose={() => setNfseCob(null)}
        />
      )}
    </div>
  )
}
