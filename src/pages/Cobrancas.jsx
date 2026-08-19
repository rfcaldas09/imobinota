import { useState, useEffect, useMemo } from 'react'
import JSZip from 'jszip'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useSubscription } from '../contexts/SubscriptionContext'
import { emitirCobrancas, emitirUmaCobranca, mesLabel, mesStr, MESES } from '../lib/cobrancas'
import MonthPicker from '../components/MonthPicker'
import OnboardingWizard, { OnboardingBanner, useOnboarding } from '../components/OnboardingWizard'

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
// Se o mês não tiver o dia solicitado, usa o último dia do mês.
// Se cair em sábado, avança para segunda-feira.
function calcDueDate(mesRef, dueDay) {
  if (!mesRef || !dueDay) return null
  const [yearStr, monthStr] = mesRef.split('-')
  const year  = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) // 1-based
  // Último dia do mês: dia 0 do mês seguinte
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(Number(dueDay), lastDay)
  const d = new Date(year, month - 1, day)
  // Avança fim de semana para segunda-feira
  if (d.getDay() === 6) d.setDate(d.getDate() + 2) // sábado → segunda
  else if (d.getDay() === 0) d.setDate(d.getDate() + 1) // domingo → segunda
  return d.toISOString().slice(0, 10)
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
    codServicoLc116:             row.contratos?.cod_servico_lc116             || null,
    discriminacaoServico:        row.contratos?.discriminacao_servico         || '',
    solicitarDiscriminacaoMensal: !!row.contratos?.solicitar_discriminacao_mensal,
    issRetido:  !!row.contratos?.iss_retido,
    pIRRF:   Number(row.contratos?.pct_irrf)   || null,
    pCSLL:   Number(row.contratos?.pct_csll)   || null,
    pCOFINS: Number(row.contratos?.pct_cofins) || null,
    pPIS:    Number(row.contratos?.pct_pis)    || null,
    pINSS:   Number(row.contratos?.pct_inss)   || null,
    tomaLogradouro: row.contratos?.toma_logradouro || '',
    tomaNumero:     row.contratos?.toma_numero     || '',
    tamaBairro:     row.contratos?.toma_bairro     || '',
    tamaCep:        row.contratos?.toma_cep        || '',
    tamaCodMun:     row.contratos?.toma_cod_mun    || '',
    tamaMunNome:    row.contratos?.toma_mun_nome   || '',
    dueDay:          row.dia_vencimento,
    status:          row.status || 'Pendente',
    mesRef:          row.mes_referencia,
    emissao:         row.data_emissao,
    nfseStatus:      lastNfse?.status      || null,
    nfseNumero:      lastNfse?.numero_nfse || null,
    nfseId:          lastNfse?.id          || null,
    // modo contabilidade (locação imobiliária)
    certPfxPath:  row.contratos?.cert_pfx_path || null,
    certSenhaEnc: row.contratos?.cert_senha    || null,
    codNbs:       row.contratos?.cod_nbs        || null,
    imovel: (row.contratos?.imovel_cib || row.contratos?.imovel_cep) ? {
      cib:            row.contratos?.imovel_cib             || null,
      inscricaoFiscal:row.contratos?.imovel_inscricao_fiscal || null,
      finalidade:     row.contratos?.imovel_finalidade       || null,
      logradouro:     row.contratos?.imovel_logradouro       || '',
      numero:         row.contratos?.imovel_numero           || 'S/N',
      complemento:    row.contratos?.imovel_complemento      || null,
      bairro:         row.contratos?.imovel_bairro           || '',
      cep:            row.contratos?.imovel_cep              || '',
      codMun:         row.contratos?.imovel_cod_mun          || '',
      munNome:        row.contratos?.imovel_mun_nome         || '',
    } : null,
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
    if (cob.value > 0)            additionalInfo.push({ key: 'Valor',             value: fmtCi(cob.value) })
    if (cob.seguroFinanceiro > 0) additionalInfo.push({ key: 'Seguro Financeiro', value: fmtCi(cob.seguroFinanceiro) })
    if (cob.seguroIncendio   > 0) additionalInfo.push({ key: 'Seguro Incendio',   value: fmtCi(cob.seguroIncendio) })
    if (cob.iptu             > 0) additionalInfo.push({ key: 'IPTU',              value: fmtCi(cob.iptu) })
    additionalInfo.push({ key: 'Total', value: fmtCi(cob.totalValue) })

    const comment = [
      `Cobrança ref. ${refLabel(cob.mesRef)}`,
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
                    <span>Valor</span><span className="font-medium">{fmt(cob.value)}</span>
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
  // Discriminação: pré-preenchida com o texto fixo do contrato (se houver)
  const [discriminacao, setDiscriminacao] = useState(cob.discriminacaoServico || '')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [xmlLoading, setXmlLoading] = useState(false)

  const downloadPdf = async () => {
    if (!result?.emissaoId) return
    setPdfLoading(true)
    try {
      const res  = await fetch('/.netlify/functions/nfse-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: result.emissaoId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao baixar PDF: ${data.error}`); return }
      const bytes = Uint8Array.from(atob(data.pdfBase64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url
      a.download = data.filename || 'NFS-e.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert(`Erro: ${e.message}`) }
    finally { setPdfLoading(false) }
  }

  const downloadXml = async () => {
    if (!result?.emissaoId) return
    setXmlLoading(true)
    try {
      const res  = await fetch('/.netlify/functions/nfse-xml', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: result.emissaoId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao baixar XML: ${data.error}`); return }
      const bytes = Uint8Array.from(atob(data.xmlBase64), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/xml' }))
      const a = document.createElement('a'); a.href = url
      a.download = data.filename || 'NFS-e.xml'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert(`Erro: ${e.message}`) }
    finally { setXmlLoading(false) }
  }

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
            discriminacao:    discriminacao        || null,
            tomadorEnd: {
              logradouro: cob.tomaLogradouro || '',
              numero:     cob.tomaNumero     || 'S/N',
              bairro:     cob.tamaBairro     || '',
              cep:        cob.tamaCep        || '',
              codMun:     cob.tamaCodMun     || '',
            },
            retencoes: {
              tpRetISSQN: cob.issRetido ? 2 : 1,
              pIRRF:   cob.pIRRF   || null,
              pCSLL:   cob.pCSLL   || null,
              pCOFINS: cob.pCOFINS || null,
              pPIS:    cob.pPIS    || null,
              pINSS:   cob.pINSS   || null,
            },
            certPfxPath:  cob.certPfxPath  || null,
            certSenhaEnc: cob.certSenhaEnc || null,
            codNbs:       cob.codNbs       || null,
            imovel:       cob.imovel       || null,
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
                  <span>Valor</span><span className="font-medium">{fmt(cob.value)}</span>
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

            {/* Discriminação do serviço */}
            {cob.solicitarDiscriminacaoMensal && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">
                  Discriminação do serviço <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={discriminacao}
                  onChange={e => setDiscriminacao(e.target.value)}
                  placeholder="Ex: Ref. OC nº 12345 — Administração imobiliária jan/2026"
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">{discriminacao.length}/2000 caracteres</p>
              </div>
            )}
            {!cob.solicitarDiscriminacaoMensal && cob.discriminacaoServico && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-xs font-semibold text-slate-400 mb-0.5">Discriminação do serviço</p>
                <p className="text-xs text-slate-600">{cob.discriminacaoServico}</p>
              </div>
            )}

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

            {result.emissaoId && (
              <div className="flex gap-2">
                <button
                  onClick={downloadPdf}
                  disabled={pdfLoading || xmlLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50">
                  {pdfLoading
                    ? <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                    : <IcDownload c="w-4 h-4"/>}
                  PDF
                </button>
                <button
                  onClick={downloadXml}
                  disabled={xmlLoading || pdfLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50">
                  {xmlLoading
                    ? <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/>
                    : <span className="font-mono font-bold text-xs">&lt;/&gt;</span>}
                  XML
                </button>
              </div>
            )}

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
  const [pdfLoading, setPdfLoading] = useState(null)
  const [xmlLoading, setXmlLoading] = useState(null)
  const [cancelConfirmId, setCancelConfirmId] = useState(null)
  const [cancellingId,    setCancellingId]    = useState(null)

  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [onClose])

  const loadEmissoes = () => {
    setLoading(true)
    supabase
      .from('nfse_emissoes')
      .select('*')
      .eq('user_id', user.id)
      .eq('cobranca_id', cob.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEmissoes(data || []); setLoading(false) })
  }

  useEffect(() => { loadEmissoes() }, [cob.id, user.id])

  const handleCancelar = async (em) => {
    if (cancelConfirmId !== em.id) { setCancelConfirmId(em.id); return }
    setCancelConfirmId(null)
    setCancellingId(em.id)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { 'Authorization': `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ userId: user.id, emissaoId: em.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar')
      loadEmissoes()
    } catch (e) {
      alert(`Erro ao cancelar NFS-e: ${e.message}`)
    } finally {
      setCancellingId(null)
    }
  }

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

  const verXml = async (em) => {
    setXmlLoading(em.id)
    try {
      const res = await fetch('/.netlify/functions/nfse-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: em.id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao baixar XML: ${data.error}`); return }
      const bytes = Uint8Array.from(atob(data.xmlBase64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/xml' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href      = url
      a.download  = data.filename || `NFS-e.xml`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (err) {
      alert(`Erro: ${err.message}`)
    } finally {
      setXmlLoading(null)
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        em.status === 'erro'      ? 'bg-red-100 text-red-700' :
                        em.status === 'cancelada' ? 'bg-slate-100 text-slate-500' :
                                                    'bg-emerald-100 text-emerald-700'
                      }`}>
                        {em.status === 'cancelada' ? 'Cancelada' : em.status || 'emitida'}
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
                    {em.status === 'erro' && em.erro_msg && (
                      <div className="mt-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="text-[11px] font-semibold text-red-600 mb-0.5">Detalhes do erro:</p>
                        <p className="text-xs text-red-700 whitespace-pre-wrap break-words select-all">{em.erro_msg}</p>
                      </div>
                    )}
                  </div>
                  {em.status !== 'erro' && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => verPdf(em)}
                      disabled={pdfLoading === em.id || !!xmlLoading || !!cancellingId}
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                      {pdfLoading === em.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                      ) : (
                        <IcDownload c="w-3.5 h-3.5"/>
                      )}
                      PDF
                    </button>
                    <button
                      onClick={() => verXml(em)}
                      disabled={xmlLoading === em.id || !!pdfLoading || !!cancellingId}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                      {xmlLoading === em.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/>
                      ) : (
                        <span className="font-mono font-bold text-[11px]">&lt;/&gt;</span>
                      )}
                      XML
                    </button>
                    {em.status !== 'cancelada' && (
                      cancelConfirmId === em.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCancelar(em)}
                            disabled={cancellingId === em.id}
                            className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                            {cancellingId === em.id
                              ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-white rounded-full animate-spin"/>
                              : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setCancelConfirmId(null)}
                            className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors">
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCancelar(em)}
                          disabled={!!pdfLoading || !!xmlLoading || !!cancellingId}
                          title="Cancelar NFS-e"
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                          🚫
                        </button>
                      )
                    )}
                  </div>
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
  { id: 'nfse', label: 'Somente NFS-e', icon: '📄', desc: 'Emite notas fiscais de serviço' },
]

// ── Modal Gerar e Enviar em Massa ─────────────────────────────────
function BatchModal({ contracts, user, pixKey, mesRef: initialMes, onClose, onDone }) {
  const { isActive } = useSubscription()
  const [step, setStep]         = useState('pick') // pick | selecao | discriminacao | running | done
  const [action, setAction]     = useState('nfse')
  const [mesRef, setMesRef]     = useState(initialMes)
  const [preview, setPreview]   = useState(null)  // { toCreate, skipped, pendingContracts }
  const [selectedIds, setSelectedIds] = useState(null) // Set de IDs selecionados no step selecao
  const [progress, setProgress] = useState(0)
  const [logs, setLogs]         = useState([])
  const [result, setResult]     = useState(null)
  // discriminações pendentes: { [cobrancaId]: string }
  const [discMap, setDiscMap]   = useState({})

  useEffect(() => {
    if (!user || !contracts.length) return
    setPreview(null)
    const ref = mesStr(mesRef)

    // Busca cobrancas do mês e, para cada uma, a última NFS-e emitida
    supabase.from('cobrancas').select('id, contrato_id')
      .eq('user_id', user.id).eq('mes_referencia', ref)
      .then(async ({ data: cobs }) => {
        const cobsByContrato = {}
        for (const c of (cobs || [])) cobsByContrato[c.contrato_id] = c.id

        // Verifica quais cobrancas têm NFS-e com sucesso (não apenas erro)
        const cobIds = Object.values(cobsByContrato)
        let okCobIds = new Set()
        if (cobIds.length) {
          const { data: emissoes } = await supabase
            .from('nfse_emissoes')
            .select('cobranca_id, status')
            .in('cobranca_id', cobIds)
            .in('status', ['emitida', 'cancelada'])
          for (const em of (emissoes || [])) okCobIds.add(em.cobranca_id)
        }

        // Pendente = sem cobrança OU cobrança sem NFS-e de sucesso (só erro)
        const pendingContracts = contracts.filter(c => {
          const cobId = cobsByContrato[c.id]
          if (!cobId) return true          // sem cobrança → pendente
          return !okCobIds.has(cobId)      // cobrança existe mas só tem erro → pendente
        })
        const skipped = contracts.length - pendingContracts.length
        setPreview({ toCreate: pendingContracts.length, skipped, pendingContracts })
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

  // Contratos que realmente serão processados (todos os pendentes, ou apenas os selecionados)
  const activeContracts = selectedIds
    ? contracts.filter(c => selectedIds.has(c.id))
    : contracts

  const goToSelecao = () => {
    const pendingIds = new Set((preview?.pendingContracts || []).map(c => c.id))
    setSelectedIds(pendingIds)
    setStep('selecao')
  }

  const buildFila = async () => {
    const ref = mesStr(mesRef)
    const { data: cobsDoMes } = await supabase
      .from('cobrancas')
      .select('id, valor_total, mes_referencia, contrato_id, contratos(imovel, cod_servico_lc116, discriminacao_servico, solicitar_discriminacao_mensal, seguro_financeiro, seguro_incendio, iptu, iss_retido, pct_irrf, pct_csll, pct_cofins, pct_pis, pct_inss, toma_logradouro, toma_numero, toma_bairro, toma_cep, toma_cod_mun, toma_mun_nome, imovel_cib, imovel_inscricao_fiscal, imovel_finalidade, imovel_logradouro, imovel_numero, imovel_complemento, imovel_bairro, imovel_cep, imovel_cod_mun, imovel_mun_nome, cod_nbs, cert_pfx_path, cert_senha), inquilinos(nome, cpf, email)')
      .eq('user_id', user.id)
      .eq('mes_referencia', ref)
      .in('contrato_id', activeContracts.map(c => c.id))

    return (cobsDoMes || []).map(cob => ({
      id:              cob.id,
      tenant:          cob.inquilinos?.nome  || '—',
      cpf:             cob.inquilinos?.cpf   || '',
      email:           cob.inquilinos?.email || '',
      property:        cob.contratos?.imovel || '',
      totalValue:      Number(cob.valor_total) || 0,
      value:           Number(cob.valor_total) || 0,
      seguroFinanceiro:Number(cob.contratos?.seguro_financeiro) || 0,
      seguroIncendio:  Number(cob.contratos?.seguro_incendio)   || 0,
      iptu:            Number(cob.contratos?.iptu)              || 0,
      codServicoLc116:             cob.contratos?.cod_servico_lc116             || null,
      discriminacaoServico:        cob.contratos?.discriminacao_servico         || '',
      solicitarDiscriminacaoMensal: !!cob.contratos?.solicitar_discriminacao_mensal,
      issRetido:  !!cob.contratos?.iss_retido,
      pIRRF:   cob.contratos?.pct_irrf   || null,
      pCSLL:   cob.contratos?.pct_csll   || null,
      pCOFINS: cob.contratos?.pct_cofins || null,
      pPIS:    cob.contratos?.pct_pis    || null,
      pINSS:   cob.contratos?.pct_inss   || null,
      tomaLogradouro: cob.contratos?.toma_logradouro || '',
      tomaNumero:     cob.contratos?.toma_numero     || '',
      tamaBairro:     cob.contratos?.toma_bairro     || '',
      tamaCep:        cob.contratos?.toma_cep        || '',
      tamaCodMun:     cob.contratos?.toma_cod_mun    || '',
      mesRef:          cob.mes_referencia,
      // modo contabilidade (locação imobiliária)
      certPfxPath:  cob.contratos?.cert_pfx_path || null,
      certSenhaEnc: cob.contratos?.cert_senha    || null,
      codNbs:       cob.contratos?.cod_nbs        || null,
      imovel: (cob.contratos?.imovel_cib || cob.contratos?.imovel_cep) ? {
        cib:            cob.contratos?.imovel_cib             || null,
        inscricaoFiscal:cob.contratos?.imovel_inscricao_fiscal || null,
        finalidade:     cob.contratos?.imovel_finalidade       || null,
        logradouro:     cob.contratos?.imovel_logradouro       || '',
        numero:         cob.contratos?.imovel_numero           || 'S/N',
        complemento:    cob.contratos?.imovel_complemento      || null,
        bairro:         cob.contratos?.imovel_bairro           || '',
        cep:            cob.contratos?.imovel_cep              || '',
        codMun:         cob.contratos?.imovel_cod_mun          || '',
        munNome:        cob.contratos?.imovel_mun_nome         || '',
      } : null,
    }))
  }

  const confirm = async () => {
    setProgress(0)
    setLogs([])
    setResult(null)

    // ── Passo 1: cria cobrancas (pula as que já existem) ──────────
    const res = await emitirCobrancas(user.id, activeContracts, mesRef)
    if (res.error) {
      setResult({ created: 0, skipped: res.skipped, fails: 0, error: res.error })
      setStep('done')
      return
    }

    if (action !== 'nfse') {
      setResult({ created: res.created, skipped: res.skipped, fails: 0, error: null })
      setStep('done')
      onDone()
      return
    }

    // ── Passo 2: busca fila e verifica se há contratos que pedem discriminação mensal ─
    const fila = await buildFila()
    const precisamDiscriminacao = fila.filter(c => c.solicitarDiscriminacaoMensal)

    if (precisamDiscriminacao.length > 0) {
      // Inicializa o map com o texto fixo (se houver) como sugestão
      const init = {}
      precisamDiscriminacao.forEach(c => { init[c.id] = c.discriminacaoServico || '' })
      setDiscMap(init)
      // Armazena fila no state para usar depois
      setResult({ _fila: fila, created: res.created, skipped: res.skipped })
      setStep('discriminacao')
      return
    }

    // Nenhum contrato precisa de discriminação manual — vai direto
    await runFila(fila, {}, res)
  }

  // ── Executa emissão para todos da fila ──────────────────────────
  const runFila = async (fila, discMapLocal, prevRes) => {
    setStep('running')
    const total = fila.length
    let ok = 0, fails = 0

    for (let i = 0; i < fila.length; i++) {
      const cob = fila[i]

      setLogs(l => [...l, { id: cob.id, name: cob.tenant, property: cob.property, status: 'pending' }])

      // Discriminação: do map (mensal capturado no passo anterior) ou fixo do contrato
      const discriminacao = discMapLocal[cob.id] || cob.discriminacaoServico || null

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
              discriminacao,
              tomadorEnd: {
                logradouro: cob.tomaLogradouro || '',
                numero:     cob.tomaNumero     || 'S/N',
                bairro:     cob.tamaBairro     || '',
                cep:        cob.tamaCep        || '',
                codMun:     cob.tamaCodMun     || '',
              },
              retencoes: {
                tpRetISSQN: cob.issRetido ? 2 : 1,
                pIRRF:   cob.pIRRF   || null,
                pCSLL:   cob.pCSLL   || null,
                pCOFINS: cob.pCOFINS || null,
                pPIS:    cob.pPIS    || null,
                pINSS:   cob.pINSS   || null,
              },
              certPfxPath:  cob.certPfxPath  || null,
              certSenhaEnc: cob.certSenhaEnc || null,
              codNbs:       cob.codNbs       || null,
              imovel:       cob.imovel       || null,
            },
          }),
        })
        const data = await resp.json()
        if (!resp.ok || data.error) throw new Error(data.error || `HTTP ${resp.status}`)

        ok++
        setLogs(l => l.map(e => e.id === cob.id && e.status === 'pending'
          ? { ...e, status: 'ok', numero: data.numeroNfse || '' }
          : e))
      } catch (err) {
        fails++
        setLogs(l => l.map(e => e.id === cob.id && e.status === 'pending'
          ? { ...e, status: 'error', msg: err.message }
          : e))
      }

      setProgress(i + 1)
      if (i < fila.length - 1) await new Promise(r => setTimeout(r, 300))
    }

    setResult({ created: ok, skipped: (prevRes?.skipped ?? 0) + (total - fila.length >= 0 ? 0 : 0), fails, error: null })
    setStep('done')
    onDone()
  }

  const total = (() => {
    // estimativa para barra de progresso — usa selecionados se houver, senão todos os pendentes
    return selectedIds ? selectedIds.size : (preview?.toCreate ?? 0)
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
            {/* Preview */}
            {preview ? (
              <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                preview.toCreate > 0
                  ? 'bg-indigo-50 border border-indigo-200 text-indigo-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                {preview.toCreate > 0
                  ? <><strong>{preview.toCreate}</strong> contrato{preview.toCreate !== 1 ? 's' : ''} serão gerados.
                      {preview.skipped > 0 && <span className="text-indigo-500 ml-1">({preview.skipped} já emitidos — ignorados)</span>}</>
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
              <button onClick={goToSelecao} disabled={!canConfirm}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold flex items-center justify-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed">
                <span>{selectedAction?.icon}</span> Continuar →
              </button>
            </div>
          </div>
        )}

        {step === 'selecao' && preview && (
          <div className="p-7 flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-xl flex-shrink-0">📋</div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Selecionar contratos</h2>
                <p className="text-xs text-slate-400">Marque os que deseja gerar para {mesLabel(mesRef)}</p>
              </div>
            </div>

            {/* Barra selecionar todos + contador */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => {
                  const allIds = new Set((preview.pendingContracts || []).map(c => c.id))
                  const allSelected = (preview.pendingContracts || []).every(c => selectedIds?.has(c.id))
                  setSelectedIds(allSelected ? new Set() : allIds)
                }}
                className="text-xs text-indigo-600 font-semibold hover:underline"
              >
                {(preview.pendingContracts || []).every(c => selectedIds?.has(c.id))
                  ? 'Desmarcar todos'
                  : 'Selecionar todos'}
              </button>
              <span className="text-xs text-slate-500 font-medium">
                <span className="text-indigo-700 font-bold">{selectedIds?.size ?? 0}</span> de {preview.pendingContracts?.length ?? 0} selecionados
              </span>
            </div>

            {/* Lista de contratos */}
            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1" style={{ maxHeight: '50vh' }}>
              {(preview.pendingContracts || []).map(c => {
                const checked = selectedIds?.has(c.id) ?? false
                return (
                  <label key={c.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                      checked ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => {
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                        return next
                      })
                    }} className="accent-indigo-600 w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.tenant}</p>
                      <p className="text-xs text-slate-400 truncate">{c.property}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
                      {(c.totalValue ?? 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="flex gap-3 mt-5 pt-4 border-t border-slate-100">
              <button onClick={() => setStep('pick')} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">Voltar</button>
              <button
                onClick={confirm}
                disabled={(selectedIds?.size ?? 0) === 0}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed">
                📄 Confirmar {selectedIds?.size ? `(${selectedIds.size})` : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'discriminacao' && result?._fila && (
          <div className="p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-lg">✏️</div>
              <div>
                <p className="font-bold text-slate-900 text-sm">Discriminação do serviço</p>
                <p className="text-xs text-slate-400">Preencha para os contratos que exigem texto mensal</p>
              </div>
            </div>

            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {result._fila.filter(c => c.solicitarDiscriminacaoMensal).map(cob => (
                <div key={cob.id} className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-700">{cob.tenant}</p>
                  <p className="text-xs text-slate-400">{cob.property}</p>
                  <textarea
                    value={discMap[cob.id] ?? ''}
                    onChange={e => setDiscMap(m => ({ ...m, [cob.id]: e.target.value }))}
                    placeholder="Ex: OC nº 12345 — Administração imobiliária ref. jan/2026"
                    rows={2}
                    maxLength={2000}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep('pick')} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">Voltar</button>
              <button
                onClick={() => runFila(result._fila, discMap, result)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center gap-2">
                Emitir NFS-e →
              </button>
            </div>
          </div>
        )}

        {step === 'running' && (
          <div className="p-6 flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
              </div>
              <div>
                <p className="font-bold text-slate-900">Emitindo NFS-e — {mesLabel(mesRef)}</p>
                <p className="text-xs text-slate-400">Não feche esta janela · {progress} de {total}</p>
              </div>
            </div>
            {/* Barra de progresso */}
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-500">{progress} <span className="text-slate-400">de {total}</span></span>
                <span className="font-bold text-indigo-600">{pct}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300" style={{ width:`${pct}%` }}/>
              </div>
            </div>
            {/* Lista de contratos */}
            <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5" style={{ maxHeight: '52vh' }}>
              {logs.map((l, i) => (
                <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-sm ${
                  l.status === 'ok'      ? 'bg-emerald-50 border-emerald-200' :
                  l.status === 'error'   ? 'bg-red-50 border-red-200' :
                                           'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex-shrink-0 mt-0.5">
                    {l.status === 'ok'    && <span className="text-emerald-600 font-bold">✓</span>}
                    {l.status === 'error' && <span className="text-red-500 font-bold">✗</span>}
                    {l.status === 'pending' && <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${
                      l.status === 'ok' ? 'text-emerald-800' :
                      l.status === 'error' ? 'text-red-800' : 'text-slate-700'
                    }`}>{l.name}</p>
                    {l.status === 'ok' && (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        NFS-e{l.numero ? ` nº ${l.numero}` : ''} emitida com sucesso
                      </p>
                    )}
                    {l.status === 'error' && (
                      <p className="text-xs text-red-600 mt-0.5 break-words">{l.msg}</p>
                    )}
                    {l.status === 'pending' && (
                      <p className="text-xs text-slate-400 mt-0.5">Emitindo…</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="p-6 flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xl ${
                result?.fails > 0 && result?.created === 0 ? 'bg-red-100' :
                result?.fails > 0 ? 'bg-amber-100' : 'bg-emerald-100'
              }`}>
                {result?.fails > 0 && result?.created === 0 ? '❌' : result?.fails > 0 ? '⚠️' : '✅'}
              </div>
              <div>
                <p className="font-bold text-slate-900">
                  {result?.fails > 0 && result?.created === 0 ? 'Falha na emissão'
                    : result?.fails > 0 ? 'Concluído com falhas'
                    : 'Emissão concluída!'}
                </p>
                <p className="text-xs text-slate-400 capitalize">{mesLabel(mesRef)}</p>
              </div>
            </div>

            {/* KPIs */}
            {result?.error ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{result.error}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div className="bg-emerald-50 rounded-xl py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{result?.created ?? 0}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">NFS-e emitidas</p>
                </div>
                <div className="bg-red-50 rounded-xl py-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{result?.fails ?? 0}</p>
                  <p className="text-xs text-red-500 mt-0.5">Falhas</p>
                </div>
              </div>
            )}

            {/* Detalhes por contrato */}
            {logs.length > 0 && (
              <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5 mb-4" style={{ maxHeight: '44vh' }}>
                {logs.map((l, i) => (
                  <div key={i} className={`flex items-start gap-3 px-3.5 py-2.5 rounded-xl border text-sm ${
                    l.status === 'ok'    ? 'bg-emerald-50 border-emerald-200' :
                    l.status === 'error' ? 'bg-red-50 border-red-200' :
                                          'bg-slate-50 border-slate-200'
                  }`}>
                    <span className="flex-shrink-0 mt-0.5 font-bold">
                      {l.status === 'ok' ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold truncate ${
                        l.status === 'ok' ? 'text-emerald-800' : 'text-red-800'
                      }`}>{l.name}</p>
                      {l.status === 'ok' && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          NFS-e{l.numero ? ` nº ${l.numero}` : ''} emitida com sucesso
                        </p>
                      )}
                      {l.status === 'error' && (
                        <p className="text-xs text-red-600 mt-0.5 break-words">{l.msg}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 text-sm">
              Fechar
            </button>
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
    if (!f.value || Number(f.value) <= 0) { setErr('Informe o valor'); return }
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
          <h2 className="text-base font-bold text-slate-900">Adicionar Contrato para Cobrança</h2>
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
              <label className="text-xs font-medium text-slate-500 block mb-1">Valor (R$) *</label>
              <input type="number" min="0" step="0.01" value={f.value} onChange={e => set('value', e.target.value)}
                className={inp} placeholder="0,00"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Dia de vencimento *</label>
              <input type="number" min="1" max="31" value={f.dueDay} onChange={e => set('dueDay', e.target.value)}
                className={inp} placeholder="1-31"/>
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
  const { certSet, loading: onboardingLoading } = useOnboarding()
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
  const [nfseViewCob, setNfseViewCob] = useState(null) // cobrança para "Logs de envio"
  const [addCob, setAddCob]       = useState(false) // abrir modal de adicionar cobrança
  const [editValorCob, setEditValorCob] = useState(null) // cobrança com edição de valor aberta
  const [editValorInput, setEditValorInput] = useState('') // valor digitado (string formatada BRL)

  // ── Ações inline de NFS-e (PDF / XML / Cancelar) na tabela ───────
  const [inlinePdfId,        setInlinePdfId]        = useState(null) // cobId carregando PDF
  const [inlineXmlId,        setInlineXmlId]        = useState(null) // cobId carregando XML
  const [inlineCancelConfirm,setInlineCancelConfirm]= useState(null) // cobId aguardando confirm
  const [inlineCancelling,   setInlineCancelling]   = useState(null) // cobId cancelando

  const inlineDownloadPdf = async (c) => {
    if (!c.nfseId) return
    setInlinePdfId(c.id)
    try {
      const res  = await fetch('/.netlify/functions/nfse-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: c.nfseId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao baixar PDF: ${data.error}`); return }
      const bytes = Uint8Array.from(atob(data.pdfBase64), ch => ch.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url
      a.download = data.filename || 'NFS-e.pdf'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert(`Erro: ${e.message}`) }
    finally { setInlinePdfId(null) }
  }

  const inlineDownloadXml = async (c) => {
    if (!c.nfseId) return
    setInlineXmlId(c.id)
    try {
      const res  = await fetch('/.netlify/functions/nfse-xml', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, emissaoId: c.nfseId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(`Erro ao baixar XML: ${data.error}`); return }
      const bytes = Uint8Array.from(atob(data.xmlBase64), ch => ch.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/xml' }))
      const a = document.createElement('a'); a.href = url
      a.download = data.filename || 'NFS-e.xml'; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert(`Erro: ${e.message}`) }
    finally { setInlineXmlId(null) }
  }

  const inlineCancelar = async (c) => {
    if (!c.nfseId) return
    if (inlineCancelConfirm !== c.id) { setInlineCancelConfirm(c.id); return }
    setInlineCancelConfirm(null)
    setInlineCancelling(c.id)
    try {
      const jwt = (await supabase.auth.getSession())?.data?.session?.access_token
      const res = await fetch('/.netlify/functions/nfse-cancelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify({ userId: user.id, emissaoId: c.nfseId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao cancelar')
      load()
    } catch (e) { alert(`Erro ao cancelar NFS-e: ${e.message}`) }
    finally { setInlineCancelling(null) }
  }

  // ── Download ZIP com todos os PDF + XML do mês ────────────────────
  const [zipLoading, setZipLoading] = useState(false)
  const [zipProgress, setZipProgress] = useState({ done: 0, total: 0 })

  const downloadZipMes = async () => {
    // Pega emissões do mês com status 'emitida'
    const ref = mesStr(mesRef)
    const cobIds = cobrancas.filter(c => c.nfseStatus === 'emitida' && c.nfseId).map(c => c.nfseId)
    if (!cobIds.length) { alert('Nenhuma NFS-e emitida neste mês.'); return }

    setZipLoading(true)
    setZipProgress({ done: 0, total: cobIds.length * 2 }) // PDF + XML por emissão

    const zip = new JSZip()
    const pdfFolder = zip.folder('PDF')
    const xmlFolder = zip.folder('XML')

    let done = 0
    const cobsEmitidas = cobrancas.filter(c => c.nfseStatus === 'emitida' && c.nfseId)

    for (const c of cobsEmitidas) {
      // PDF
      try {
        const res  = await fetch('/.netlify/functions/nfse-pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, emissaoId: c.nfseId }),
        })
        const data = await res.json()
        if (res.ok && data.pdfBase64) {
          const bytes = Uint8Array.from(atob(data.pdfBase64), ch => ch.charCodeAt(0))
          pdfFolder.file(data.filename || `NFS-e_${c.nfseNumero || c.id}.pdf`, bytes)
        }
      } catch { /* ignora falha individual */ }
      done++; setZipProgress({ done, total: cobIds.length * 2 })

      // XML
      try {
        const res  = await fetch('/.netlify/functions/nfse-xml', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, emissaoId: c.nfseId }),
        })
        const data = await res.json()
        if (res.ok && data.xmlBase64) {
          const bytes = Uint8Array.from(atob(data.xmlBase64), ch => ch.charCodeAt(0))
          xmlFolder.file(data.filename || `NFS-e_${c.nfseNumero || c.id}.xml`, bytes)
        }
      } catch { /* ignora falha individual */ }
      done++; setZipProgress({ done, total: cobIds.length * 2 })
    }

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `NFS-e_${ref.replace('-', '_')}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)

    setZipLoading(false)
  }

  // Carrega chave PIX do perfil (ainda necessária para o BoletoPIXModal)
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
      .select('*, contratos(imovel, seguro_financeiro, seguro_incendio, iptu, cod_servico_lc116, discriminacao_servico, solicitar_discriminacao_mensal, iss_retido, pct_irrf, pct_csll, pct_cofins, pct_pis, pct_inss, toma_logradouro, toma_numero, toma_bairro, toma_cep, toma_cod_mun, toma_mun_nome, imovel_cib, imovel_inscricao_fiscal, imovel_finalidade, imovel_logradouro, imovel_numero, imovel_complemento, imovel_bairro, imovel_cep, imovel_cod_mun, imovel_mun_nome, cod_nbs, cert_pfx_path, cert_senha), inquilinos(nome, cpf, email)')
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
      .select('id, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, status, discriminacao_servico, solicitar_discriminacao_mensal, inquilinos(nome)')
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
      discriminacaoServico:        r.discriminacao_servico          || '',
      solicitarDiscriminacaoMensal: !!r.solicitar_discriminacao_mensal,
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

  // ── Editar valor de uma cobrança específica (não altera o contrato) ──
  const openEditValor = (c) => {
    setEditValorCob(c)
    setEditValorInput(String(c.totalValue).replace('.', ','))
  }
  const saveEditValor = async () => {
    if (!editValorCob) return
    const raw = editValorInput.replace(/\./g, '').replace(',', '.')
    const novoTotal = parseFloat(raw)
    if (isNaN(novoTotal) || novoTotal <= 0) return
    const extras = Number(editValorCob.seguroFinanceiro) + Number(editValorCob.seguroIncendio) + Number(editValorCob.iptu)
    const novoAluguel = Math.max(0, novoTotal - extras)
    setUpdatingId(editValorCob.id)
    await supabase.from('cobrancas').update({
      valor_total:   novoTotal,
      valor_aluguel: novoAluguel,
    }).eq('id', editValorCob.id)
    setCobrancas(prev => prev.map(c =>
      c.id === editValorCob.id ? { ...c, totalValue: novoTotal, value: novoAluguel } : c
    ))
    setUpdatingId(null)
    setEditValorCob(null)
  }

  const currentMonth = `${MESES[mesRef.getMonth()]} / ${mesRef.getFullYear()}`

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Banner de onboarding — visível se chave PIX ainda não configurada */}
      {!onboardingLoading && !certSet && <OnboardingBanner />}

      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Contratos</h1>
        <p className="text-sm text-slate-500 capitalize">
          {loading ? 'Carregando…' : `${kpi.total} contrato${kpi.total !== 1 ? 's' : ''} · ${currentMonth}`}
        </p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 text-white col-span-2 lg:col-span-1">
          <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide mb-1">Total</p>
          <p className="text-2xl font-bold">{fmt(kpi.totalVal)}</p>
          <p className="text-indigo-200 text-xs mt-1">{kpi.total} contrato{kpi.total !== 1 ? 's' : ''}</p>
        </div>
        {[
          { label:'✅ Pagos',      val: kpi.pagosVal,    count: kpi.pagos,     color:'emerald', text:'text-emerald-600' },
          { label:'⏳ Pendentes',  val: kpi.pendentesVal, count: kpi.pendentes, color:'amber',   text:'text-amber-600'  },
          { label:'🔴 Em Atraso',  val: kpi.atrasoVal,   count: kpi.atraso,    color:'red',     text:'text-red-600'    },
        ].map(({ label, val, count, color, text }) => (
          <div key={label} className="bg-white rounded-2xl p-5 border border-slate-100">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-xl font-bold ${text}`}>{fmt(val)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{count} contrato{count !== 1 ? 's' : ''}</p>
            <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
              <div className={`h-full bg-${color}-500 rounded-full`}
                style={{ width:`${kpi.total > 0 ? Math.round(count/kpi.total*100) : 0}%` }}/>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filtros + Ações ────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {f}
              </button>
            ))}
          </div>
          <MonthPicker value={mesRef} onChange={v => { setMesRef(v); setFilter('Todos') }}/>
          <button onClick={load} disabled={loading} title="Atualizar"
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
            <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAddCob(true)}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-slate-50 shadow-sm whitespace-nowrap">
            <IcPlus c="w-4 h-4"/> Adicionar contrato para cobrança
          </button>
          <button onClick={() => isActive ? setShowBatch(true) : navigate('/plano')}
            title={!isActive ? 'Assine um plano para usar esta função' : ''}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm shadow-md whitespace-nowrap ${
              isActive
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-indigo-200'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}>
            {isActive ? <IcZap c="w-4 h-4"/> : '🔒'} Gerar e enviar notas do mês
          </button>
        </div>
      </div>

      {/* ── Linha de download em massa ─────────────────────── */}
      {isActive && cobrancas.some(c => c.nfseStatus === 'emitida' && c.nfseId) && (
        <div className="flex items-center gap-3">
          <button
            onClick={downloadZipMes}
            disabled={zipLoading}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-slate-50 shadow-sm whitespace-nowrap disabled:opacity-60 disabled:cursor-wait">
            {zipLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin"/>
                Gerando ZIP… {zipProgress.done}/{zipProgress.total}
              </>
            ) : (
              <>
                <IcDownload c="w-4 h-4"/>
                Baixar todos os PDF e XML do mês ({cobrancas.filter(c => c.nfseStatus === 'emitida' && c.nfseId).length} notas)
              </>
            )}
          </button>
        </div>
      )}

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
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell w-40">Referência</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Venc.</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Valor</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden xl:table-cell">Situação</th>
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
                  <td className="px-3 py-3.5 text-slate-500 hidden md:table-cell w-40 max-w-[10rem] truncate overflow-hidden">{c.property}</td>
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
                  {/* Coluna Situação — botões de status (visível em telas xl+) */}
                  <td className="px-3 py-3.5 hidden xl:table-cell">
                    {updatingId === c.id ? null : (
                      <div className="flex flex-col items-center gap-1">
                        {c.status !== 'Pago' && (
                          <button onClick={() => updateStatus(c.id, 'Pago')}
                            className="text-xs text-emerald-600 font-semibold hover:underline whitespace-nowrap">
                            ✓ Marcar Pago
                          </button>
                        )}
                        {c.status === 'Pendente' && (
                          <button onClick={() => updateStatus(c.id, 'Em Atraso')}
                            className="text-xs text-red-500 font-semibold hover:underline whitespace-nowrap">
                            Em Atraso
                          </button>
                        )}
                        {c.status !== 'Pendente' && (
                          <button onClick={() => updateStatus(c.id, 'Pendente')}
                            className="text-xs text-amber-600 font-semibold hover:underline whitespace-nowrap">
                            Voltar p/ pendente
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Coluna Ações — NFS-e + Editar valor */}
                  <td className="px-5 py-3.5 text-right">
                    {updatingId === c.id ? (
                      <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin inline-block"/>
                    ) : (
                      <div className="flex flex-col items-end gap-1.5">

                        {/* Emitir NFS-e — desabilitado se já tem nota emitida */}
                        {(() => {
                          const jaEmitida = c.nfseStatus === 'emitida'
                          const disabled  = !isActive || jaEmitida
                          const title     = !isActive ? 'Assine um plano para emitir NFS-e'
                                          : jaEmitida ? 'Já existe NFS-e emitida para este mês'
                                          : ''
                          return (
                            <button
                              onClick={() => !disabled && setNfseCob(c)}
                              disabled={disabled}
                              title={title}
                              className={`flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors w-full justify-center ${
                                disabled
                                  ? 'text-slate-400 border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'
                                  : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                              }`}>
                              <IcReceipt c="w-3 h-3"/>
                              {!isActive ? '🔒 Emitir NFS-e' : 'Emitir NFS-e'}
                            </button>
                          )
                        })()}

                        {/* Botões inline PDF / XML / Cancelar — quando há NFS-e emitida */}
                        {isActive && c.nfseStatus === 'emitida' && c.nfseId && (
                          <div className="flex items-center gap-1 w-full">
                            {/* PDF */}
                            <button
                              onClick={() => inlineDownloadPdf(c)}
                              disabled={inlinePdfId === c.id || !!inlineXmlId || !!inlineCancelling}
                              title="Baixar PDF"
                              className="flex items-center gap-1 text-xs font-semibold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg flex-1 justify-center whitespace-nowrap transition-colors disabled:opacity-50">
                              {inlinePdfId === c.id
                                ? <div className="w-3 h-3 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"/>
                                : <IcDownload c="w-3 h-3"/>}
                              PDF
                            </button>
                            {/* XML */}
                            <button
                              onClick={() => inlineDownloadXml(c)}
                              disabled={inlineXmlId === c.id || !!inlinePdfId || !!inlineCancelling}
                              title="Baixar XML"
                              className="flex items-center gap-1 text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg flex-1 justify-center whitespace-nowrap transition-colors disabled:opacity-50">
                              {inlineXmlId === c.id
                                ? <div className="w-3 h-3 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"/>
                                : <span className="font-mono font-bold text-[10px]">&lt;/&gt;</span>}
                              XML
                            </button>
                            {/* Cancelar */}
                            {inlineCancelConfirm === c.id ? (
                              <div className="flex gap-0.5">
                                <button
                                  onClick={() => inlineCancelar(c)}
                                  disabled={inlineCancelling === c.id}
                                  className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-1.5 py-1 rounded-lg whitespace-nowrap transition-colors disabled:opacity-50">
                                  {inlineCancelling === c.id
                                    ? <div className="w-3 h-3 border-2 border-red-300 border-t-white rounded-full animate-spin"/>
                                    : 'OK?'}
                                </button>
                                <button
                                  onClick={() => setInlineCancelConfirm(null)}
                                  className="text-[10px] font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-1.5 py-1 rounded-lg transition-colors">
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => inlineCancelar(c)}
                                disabled={!!inlinePdfId || !!inlineXmlId || !!inlineCancelling}
                                title="Cancelar NFS-e"
                                className="p-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40">
                                🚫
                              </button>
                            )}
                          </div>
                        )}

                        {/* Editar valor (para desconto/ajuste pontual) */}
                        <button
                          onClick={() => openEditValor(c)}
                          className="flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors w-full justify-center text-slate-600 border-slate-200 bg-slate-50 hover:bg-slate-100">
                          ✏️ Editar valor
                        </button>

                        {/* Logs de envio (antigo "Ver NFS-e") */}
                        {isActive && (
                          <button
                            onClick={() => setNfseViewCob(c)}
                            className="flex items-center gap-1 text-xs font-semibold border px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors w-full justify-center text-slate-500 border-slate-200 bg-slate-50 hover:bg-slate-100">
                            <IcEye c="w-3 h-3"/>
                            Logs de envio
                          </button>
                        )}

                        {/* Situação — em telas < xl (mobile) */}
                        <div className="flex flex-col items-end gap-0.5 xl:hidden mt-1">
                          {c.status !== 'Pago' && (
                            <button onClick={() => updateStatus(c.id, 'Pago')}
                              className="text-xs text-emerald-600 font-semibold hover:underline whitespace-nowrap">
                              ✓ Marcar Pago
                            </button>
                          )}
                          {c.status === 'Pendente' && (
                            <button onClick={() => updateStatus(c.id, 'Em Atraso')}
                              className="text-xs text-red-500 font-semibold hover:underline whitespace-nowrap">
                              Em Atraso
                            </button>
                          )}
                          {c.status !== 'Pendente' && (
                            <button onClick={() => updateStatus(c.id, 'Pendente')}
                              className="text-xs text-amber-600 font-semibold hover:underline whitespace-nowrap">
                              Voltar p/ pendente
                            </button>
                          )}
                        </div>
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

      {/* Modal — Editar valor da cobrança (ajuste pontual / desconto) */}
      {editValorCob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900 text-sm">Editar valor do mês</p>
                <p className="text-xs text-slate-400 mt-0.5">{editValorCob.tenant} · {refLabel(editValorCob.mesRef)}</p>
              </div>
              <button onClick={() => setEditValorCob(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <IcClose c="w-4 h-4"/>
              </button>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Altera apenas esta cobrança — o contrato original não será modificado.
            </p>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Novo valor total (R$)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editValorInput}
                  onChange={e => setEditValorInput(e.target.value.replace(/[^\d,]/g, ''))}
                  onFocus={e => e.target.select()}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-right"
                />
              </div>
              {editValorCob && (Number(editValorCob.seguroFinanceiro) > 0 || Number(editValorCob.seguroIncendio) > 0 || Number(editValorCob.iptu) > 0) && (
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Extras incluídos: {fmt(Number(editValorCob.seguroFinanceiro) + Number(editValorCob.seguroIncendio) + Number(editValorCob.iptu))} (seguro/IPTU)
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditValorCob(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={saveEditValor}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showBatch && (
        <BatchModal
          contracts={contracts}
          user={user}
          pixKey={pixKey}
          mesRef={mesRef}
          onClose={() => { setShowBatch(false); load() }}
          onDone={() => load()}
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
