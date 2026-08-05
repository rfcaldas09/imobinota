import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { emitirCobrancas, emitirUmaCobranca, mesLabel, mesStr, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'
import OnboardingWizard, { OnboardingBanner } from '../components/OnboardingWizard'

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
const IcPlus    = ({ c='' }) => ic('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', c)
const IcEye     = ({ c='' }) => ic('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', c)
const IcDownload= ({ c='' }) => ic('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', c)

const fmt   = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtCi = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })

const STATUS_CFG = {
  'Pago':      { bg:'bg-emerald-100', text:'text-emerald-700', dot:'bg-emerald-500', label:'Pagto Pago'     },
  'Pendente':  { bg:'bg-amber-100',   text:'text-amber-700',   dot:'bg-amber-400',   label:'Pagto Pendente' },
  'Em Atraso': { bg:'bg-red-100',     text:'text-red-700',     dot:'bg-red-500',     label:'Pagto Atrasado' },
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
const mapCob = (row, lastNfse = null) => {
  return {
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
    codServicoLc116: row.contratos?.cod_servico_lc116         || null,
    dueDay:          row.dia_vencimento,
    status:          row.status || 'Pendente',
    mesRef:          row.mes_referencia,
    emissao:         row.data_emissao,
    nfseStatus:      lastNfse?.status   || null,
    nfseNumero:      lastNfse?.numero_nfse || null,
  }
}

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
            codServicoLc116:  cob.codServicoLc116 || null,
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

// ── Modal: Ver NFS-e emitidas para uma cobrança ───────────────────
function NfseViewModal({ cob, user, onClose }) {
  const [emissoes, setEmissoes] = useState([])
  const [loading, setLoading]   = useState(true)
  const [pdfLoading, setPdfLoading] = useState(null) // emissaoId em progresso

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  useEffect(() => {
    supabase
      .from('nfse_emissoes')
      .select('*')
      .eq('user_id', user.id)
      .eq('cobranca_id', cob.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEmissoes(data || []); setLoading(false) })
  }, [cob.id, user.id])

  const verPdf = async (em) => {
    setPdfLoading(em.id)
    try {
      const res = await fetch('/.netlify/functions/nfse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: em.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao gerar PDF: ${data.error}`); return }

      const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/pdf' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = data.filename || `NFS-e.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      alert(`Erro: ${err.message}`)
    } finally {
      setPdfLoading(null)
    }
  }

  const fmtComp = c => {
    if (!c) return ''
    const [y, m] = String(c).split('-')
    return m ? `${m}/${y}` : c
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-lg">📋</div>
            <div>
              <p className="font-bold text-slate-900 text-sm">NFS-e emitidas</p>
              <p className="text-xs text-slate-400">{cob.tenant} · {cob.property}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <IcClose c="w-4 h-4"/>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
            </div>
          ) : emissoes.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <p className="text-3xl mb-2">📄</p>
              <p className="text-sm">Nenhuma NFS-e emitida para esta cobrança.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {emissoes.map(em => (
                <div key={em.id}
                  className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800 text-sm">
                        NFS-e nº {em.numero_nfse || '—'}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${em.status === 'erro' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {em.status || 'emitida'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Competência: {fmtComp(em.competencia)} ·{' '}
                      {Number(em.valor_servico).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    {em.chave_acesso && (
                      <p className="text-xs font-mono text-slate-400 truncate mt-0.5 max-w-xs">
                        {em.chave_acesso.slice(0, 30)}…
                      </p>
                    )}
                  </div>
                  {em.status !== 'erro' && (
                  <button
                    onClick={() => verPdf(em)}
                    disabled={pdfLoading === em.id}
                    className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                    {pdfLoading === em.id ? (
                      <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                    ) : (
                      <IcDownload c="w-3.5 h-3.5"/>
                    )}
                    Ver PDF
                  </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Opções de ação no BatchModal ──────────────────────────────────
const BATCH_ACTIONS = [
  { id: 'boleto', label: 'Somente Cobranças', icon: '💳', desc: 'Em breve', disabled: true },
  { id: 'nfse',   label: 'Somente NFS-e',    icon: '📄', desc: 'Emite notas fiscais de serviço' },
  { id: 'ambos',  label: 'Cobrança + NFS-e', icon: '⚡', desc: 'Em breve', disabled: true },
]

// ── Modal Gerar e Enviar em Massa ─────────────────────────────────
function BatchModal({ contracts, user, pixKey, mesRef: initialMes, onClose, onDone }) {
  const { isActive } = useSubscription()
  const [step, setStep]         = useState('pick')
  const [action, setAction]     = useState('nfse')
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
  const canConfirm = isActive && preview && preview.toCreate > 0 && !(needsPix && !pixKey)

  const confirm = async () => {
    setStep('running')
    setProgress(0)
    setLogs([])
    setResult(null)

    // ── Passo 1: cria cobrancas (pula as que já existem) ──────────
    const res = await emitirCobrancas(user.id, contracts, mesRef)
    if (res.error) {
      setResult({ created: 0, skipped: res.skipped, fails: 0, error: res.error })
      setStep('done')
      return
    }

    if (action !== 'nfse') {
      // Ação futura (boleto, ambos) — progresso simulado simples
      setResult({ created: res.created, skipped: res.skipped, fails: 0, error: null })
      setStep('done')
      onDone()
      return
    }

    // ── Passo 2: busca todas as cobrancas do mês destes contratos ─
    const ref = mesStr(mesRef)
    const { data: cobsDoMes } = await supabase
      .from('cobrancas')
      .select('id, valor_total, mes_referencia, contrato_id, contratos(imovel, cod_servico_lc116, seguro_financeiro, seguro_incendio, iptu), inquilinos(nome, cpf, email)')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref)
      .in('contrato_id', contracts.map(c => c.id))

    const fila = (cobsDoMes || []).map(cob => ({
      id:              cob.id,
      tenant:          cob.inquilinos?.nome || '—',
      cpf:             cob.inquilinos?.cpf  || '',
      email:           cob.inquilinos?.email || '',
      property:        cob.contratos?.imovel || '',
      totalValue:      Number(cob.valor_total) || 0,
      value:           Number(cob.valor_total) || 0,
      seguroFinanceiro:Number(cob.contratos?.seguro_financeiro) || 0,
      seguroIncendio:  Number(cob.contratos?.seguro_incendio)   || 0,
      iptu:            Number(cob.contratos?.iptu)              || 0,
      codServicoLc116: cob.contratos?.cod_servico_lc116 || null,
      mesRef:          cob.mes_referencia,
    }))

    const total = fila.length
    let ok = 0, fails = 0

    // ── Passo 3: emite NFS-e para cada cobrança, uma a uma ────────
    for (let i = 0; i < fila.length; i++) {
      const cob = fila[i]
      const firstName = cob.tenant.split(' ')[0]

      // Marca como "em andamento"
      setLogs(l => [...l.slice(-80), { name: firstName, status: 'pending' }])

      try {
        const resp = await fetch('/.netlify/functions/nfse-emitir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId:      user.id,
            cobId:       cob.id,
            homologacao: false,
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
              codServicoLc116:  cob.codServicoLc116 || null,
            },
          }),
        })
        const data = await resp.json()
        if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`)

        ok++
        setLogs(l => {
          const next = [...l]; const idx = next.findLastIndex(e => e.name === firstName && e.status === 'pending')
          if (idx >= 0) next[idx] = { name: firstName, status: 'ok', numero: data.numeroNfse || '' }
          return next
        })
      } catch (err) {
        fails++
        setLogs(l => {
          const next = [...l]; const idx = next.findLastIndex(e => e.name === firstName && e.status === 'pending')
          if (idx >= 0) next[idx] = { name: firstName, status: 'error', msg: err.message.slice(0, 80) }
          return next
        })
      }

      setProgress(i + 1)
      // Pequena pausa para não sobrecarregar
      if (i < fila.length - 1) await new Promise(r => setTimeout(r, 300))
    }

    setResult({ created: ok, skipped: res.skipped + (total - fila.length), fails, error: null })
    setStep('done')
    onDone()
  }

  const total = (() => {
    // estimativa para barra de progresso — número de cobrancas que vão ser emitidas
    return preview?.toCreate ?? 0
  })()
  const pct = total > 0 ? Math.round((progress / total) * 100) : (progress > 0 ? 100 : 0)

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {step === 'pick' && (
          <div className="p-7">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-5 text-3xl">🚀</div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">Gerar e Enviar em Massa</h2>
            <p className="text-sm text-slate-500 mb-4">Selecione o mês e o que deseja gerar:</p>

            {!isActive && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
                <span className="text-lg leading-none">🔒</span>
                <div>
                  <strong>Plano inativo.</strong> Assine um plano para confirmar o envio.{' '}
                  <a href="/plano" className="underline font-semibold">Ver planos →</a>
                </div>
              </div>
            )}

            <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setPreview(null) }}/>

            {/* Seleção de ação */}
            <div className="mt-4 space-y-2">
              {BATCH_ACTIONS.map(a => (
                <button key={a.id}
                  onClick={() => !a.disabled && setAction(a.id)}
                  disabled={a.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    a.disabled
                      ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                      : action === a.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}>
                  <span className="text-xl">{a.icon}</span>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${a.disabled ? 'text-slate-400' : action === a.id ? 'text-indigo-800' : 'text-slate-700'}`}>{a.label}</p>
                    <p className={`text-xs mt-0.5 ${a.disabled ? 'text-slate-300' : action === a.id ? 'text-indigo-500' : 'text-slate-400'}`}>{a.desc}</p>
                  </div>
                  {!a.disabled && action === a.id && (
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
                <p className="font-bold text-slate-900">Emitindo NFS-e — {mesLabel(mesRef)}…</p>
                <p className="text-sm text-slate-400">Não feche esta janela · {progress} de {preview?.toCreate ?? '…'}</p>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-slate-600">{progress} <span className="text-slate-400">de {preview?.toCreate ?? '…'}</span></span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300" style={{ width:`${pct}%` }}/>
              </div>
            </div>
            <div className="bg-slate-950 rounded-xl p-3 h-52 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.slice(-40).map((l, i) => (
                l.status === 'ok' ? (
                  <div key={i} className="text-emerald-400">
                    ✓ NFS-e{l.numero ? ` nº ${l.numero}` : ''} emitida — {l.name}
                  </div>
                ) : l.status === 'error' ? (
                  <div key={i} className="text-red-400">
                    ✗ Erro — {l.name}: {l.msg}
                  </div>
                ) : (
                  <div key={i} className="text-slate-400">
                    ⏳ Emitindo NFS-e para {l.name}…
                  </div>
                )
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
                  { v: result?.created ?? 0, l: action === 'nfse' ? 'NFS-e emitidas' : 'Geradas', bg:'bg-emerald-50', c:'text-emerald-700' },
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
      {cfg.label || status}
    </span>
  )
}

// ── Modal: Adicionar cobrança manualmente ─────────────────────────
function AdicionarCobrancaModal({ contracts, user, onClose, onDone }) {
  const today = new Date()
  const defaultMes = new Date(today.getFullYear(), today.getMonth(), 1)

  const [selectedId, setSelectedId] = useState('')
  const [mesRef, setMesRefLocal]    = useState(defaultMes)
  const [f, setF] = useState({
    value: '', seguroFinanceiro: '0', seguroIncendio: '0', iptu: '0', dueDay: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  // Auto-preenche campos ao selecionar contrato
  const handleSelectContract = (id) => {
    setSelectedId(id)
    const c = contracts.find(c => c.id === id)
    if (c) {
      setF({
        value:            String(c.value),
        seguroFinanceiro: String(c.seguroFinanceiro),
        seguroIncendio:   String(c.seguroIncendio),
        iptu:             String(c.iptu),
        dueDay:           String(c.dueDay),
      })
    }
  }

  const totalValue = (Number(f.value)||0) + (Number(f.seguroFinanceiro)||0)
    + (Number(f.seguroIncendio)||0) + (Number(f.iptu)||0)

  const handleSave = async () => {
    setErr('')
    if (!selectedId)       { setErr('Selecione um contrato'); return }
    if (!f.value || Number(f.value) <= 0) { setErr('Informe o valor do aluguel'); return }
    if (!f.dueDay)         { setErr('Informe o dia de vencimento'); return }
    setSaving(true)
    try {
      const contract = contracts.find(c => c.id === selectedId)
      const result = await emitirUmaCobranca(user.id, {
        id:               selectedId,
        inquilino_id:     contract?.inquilino_id || null,
        value:            Number(f.value),
        seguroFinanceiro: Number(f.seguroFinanceiro),
        seguroIncendio:   Number(f.seguroIncendio),
        iptu:             Number(f.iptu),
        totalValue,
        dueDay:           parseInt(f.dueDay, 10),
      }, mesRef)
      if (result.error) { setErr(result.error); return }
      if (result.already) {
        setErr(`Já existe uma cobrança para este contrato em ${MESES[mesRef.getMonth()]}/${mesRef.getFullYear()}`)
        return
      }
      onDone()
      onClose()
    } catch (e) {
      setErr(e.message || 'Erro ao criar cobrança')
    } finally { setSaving(false) }
  }

  // Fechar com Escape
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const inp = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Adicionar Cobrança</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <IcClose c="w-5 h-5"/>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Contrato */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Contrato *</label>
            <select value={selectedId} onChange={e => handleSelectContract(e.target.value)}
              className={inp}>
              <option value="">Selecione um contrato…</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.tenant} {c.property ? `— ${c.property}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Mês de referência */}
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Mês de referência *</label>
            <div className="flex gap-2">
              <select value={String(mesRef.getMonth())} onChange={e => setMesRefLocal(new Date(mesRef.getFullYear(), Number(e.target.value), 1))}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {MESES.map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
              </select>
              <select value={String(mesRef.getFullYear())} onChange={e => setMesRefLocal(new Date(Number(e.target.value), mesRef.getMonth(), 1))}
                className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {Array.from({ length: 4 }, (_, i) => today.getFullYear() - 1 + i).map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Valores */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Aluguel (R$) *</label>
              <input type="number" min="0" step="0.01" value={f.value} onChange={e => set('value', e.target.value)}
                className={inp} placeholder="0,00"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Dia de vencimento *</label>
              <input type="number" min="1" max="28" value={f.dueDay} onChange={e => set('dueDay', e.target.value)}
                className={inp} placeholder="1-28"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Seg. Financeiro (R$)</label>
              <input type="number" min="0" step="0.01" value={f.seguroFinanceiro} onChange={e => set('seguroFinanceiro', e.target.value)}
                className={inp} placeholder="0,00"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Seg. Incêndio (R$)</label>
              <input type="number" min="0" step="0.01" value={f.seguroIncendio} onChange={e => set('seguroIncendio', e.target.value)}
                className={inp} placeholder="0,00"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">IPTU (R$)</label>
              <input type="number" min="0" step="0.01" value={f.iptu} onChange={e => set('iptu', e.target.value)}
                className={inp} placeholder="0,00"/>
            </div>
            <div className="flex flex-col justify-end">
              <p className="text-xs text-slate-500 mb-1">Total</p>
              <p className="text-base font-bold text-slate-800">{fmt(totalValue)}</p>
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 shadow-sm">
            {saving ? 'Salvando…' : <><IcPlus c="w-4 h-4"/> Adicionar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Cobrancas() {
  const { user }    = useAuth()
  const { isActive } = useSubscription()
  const navigate    = useNavigate()
  const [showWizard, setShowWizard] = useState(false)
  const [mesRef, setMesRef]       = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [cobrancas, setCobrancas] = useState([])
  const [contracts, setContracts] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('Todos')
  const [showBatch, setShowBatch] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)
  const [pixKey, setPixKey]       = useState(null)
  const [boletoCob, setBoletoCob] = useState(null)
  const [nfseCob, setNfseCob]       = useState(null) // cobrança selecionada para NFS-e
  const [nfseViewCob, setNfseViewCob] = useState(null) // cobrança para "Ver NFS-e"
  const [addCob, setAddCob]       = useState(false) // abrir modal de adicionar cobrança

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

    // Query principal — sem join nfse_emissoes (exige FK formal no banco)
    const { data, error } = await supabase
      .from('cobrancas')
      .select('*, contratos(imovel, seguro_financeiro, seguro_incendio, iptu, cod_servico_lc116), inquilinos(nome, cpf, email)')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref)
      .order('created_at', { ascending: false })

    // Query separada para NFS-e emitidas no mês
    const cobIds = (data || []).map(c => c.id)
    let nfseMap = {}
    if (cobIds.length) {
      const { data: emissoes } = await supabase
        .from('nfse_emissoes')
        .select('id, cobranca_id, status, numero_nfse, created_at')
        .eq('user_id', user.id)
        .in('cobranca_id', cobIds)
        .order('created_at', { ascending: false })
      // Mantém apenas a mais recente por cobrança
      for (const em of (emissoes || [])) {
        if (!nfseMap[em.cobranca_id]) nfseMap[em.cobranca_id] = em
      }
    }

    if (!error) setCobrancas((data || []).map(row => mapCob(row, nfseMap[row.id] || null)))

    const { data: ctrs } = await supabase
      .from('contratos')
      .select('id, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, status, inquilinos(nome)')
      .eq('user_id', user.id)
      .neq('status', 'Inativo')

    setContracts((ctrs || []).map(r => ({
      id:               r.id,
      inquilino_id:     r.inquilino_id,
      tenant:           r.inquilinos?.nome || '',
      property:         r.imovel           || '',
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
      {/* Banner de onboarding — visível se chave PIX ainda não configurada */}
      {!pixKey && <OnboardingBanner onOpen={() => setShowWizard(true)} />}
      {showWizard && <OnboardingWizard onComplete={() => { setShowWizard(false); supabase.from('profiles').select('pix_key_recebimento').eq('id', user.id).single().then(({ data }) => setPixKey(data?.pix_key_recebimento || null)) }} />}

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
          <button onClick={() => setAddCob(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-slate-50 shadow-sm whitespace-nowrap">
            <IcPlus c="w-4 h-4"/> Adicionar Cobrança
          </button>
          <button onClick={() => isActive ? setShowBatch(true) : navigate('/plano')}
            title={!isActive ? 'Assine um plano para usar esta função' : ''}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm shadow-md whitespace-nowrap ${
              isActive
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-indigo-200'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}>
            {isActive ? <IcZap c="w-4 h-4"/> : '🔒'} Gerar e Enviar Tudo
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
              <button onClick={() => isActive ? setShowBatch(true) : navigate('/plano')}
                className="mt-4 text-indigo-600 text-sm font-semibold hover:underline">
                {isActive ? '+ Gerar cobranças para este mês' : '🔒 Assine um plano para gerar cobranças'}
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente</th>
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
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={c.status}/>
                      {c.nfseStatus === 'emitida' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          📋 NFS-e{c.nfseNumero ? ` nº ${c.nfseNumero}` : ' ✓'}
                        </span>
                      ) : c.nfseStatus ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                          📋 NFS-e: {c.nfseStatus}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {updatingId === c.id ? (
                      <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin inline-block"/>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">
                        {/* Linha 1 — Gerar Cobrança (desabilitado temporariamente) */}
                        <button
                          disabled
                          title="Em breve"
                          className="flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap w-full justify-center text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed opacity-50">
                          <IcQR c="w-3 h-3"/>
                          Gerar Cobrança
                        </button>

                        {/* Linha 2 — Emitir NFS-e */}
                        <button
                          onClick={() => isActive ? setNfseCob(c) : null}
                          disabled={!isActive}
                          title={!isActive ? 'Assine um plano para emitir NFS-e' : ''}
                          className={`flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors w-full justify-center ${
                            isActive
                              ? 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                              : 'text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed'
                          }`}>
                          <IcReceipt c="w-3 h-3"/>
                          {isActive ? 'Emitir NFS-e' : '🔒 Emitir NFS-e'}
                        </button>

                        {/* Linha 3 — Ver NFS-e (histórico / PDF) */}
                        {isActive && (
                          <button
                            onClick={() => setNfseViewCob(c)}
                            className="flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors w-full justify-center text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100">
                            <IcEye c="w-3 h-3"/>
                            Ver NFS-e
                          </button>
                        )}

                        {/* Linha 4 — Marcar Pago + status */}
                        {c.status === 'Pago' ? (
                          <span className="text-xs text-slate-300 w-full text-center">—</span>
                        ) : (
                          <div className="flex items-center gap-2 w-full justify-end">
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
                          </div>
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

      {/* ── Modais ─────────────────────────────────────────── */}
      {showBatch && (
        <BatchModal
          contracts={contracts}
          user={user}
          pixKey={pixKey}
          mesRef={mesRef}
          onClose={() => setShowBatch(false)}
          onDone={() => { setShowBatch(false); load() }}
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
          onClose={() => { setNfseCob(null); load() }}
        />
      )}
      {nfseViewCob && (
        <NfseViewModal
          cob={nfseViewCob}
          user={user}
          onClose={() => setNfseViewCob(null)}
        />
      )}
      {addCob && (
        <AdicionarCobrancaModal
          contracts={contracts}
          user={user}
          onClose={() => setAddCob(false)}
          onDone={() => { setAddCob(false); load() }}
        />
      )}
    </div>
  )
}
