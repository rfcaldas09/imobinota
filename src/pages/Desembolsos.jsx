import { useState, useEffect, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const fmt = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const fmtMes = m => {
  if (!m) return '—'
  const [y, mo] = m.split('-')
  return new Date(y, Number(mo) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}
const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// ── Modal de novo lançamento manual ────────────────────────────────────────
function NovoLancamentoModal({ cobrancas, contratos, classificacoes, onClose, onSaved }) {
  const { user } = useAuth()
  const [contrato,        setContrato]        = useState('')
  const [cobranca,        setCobranca]        = useState('')
  const [classificacaoId, setClassificacaoId] = useState('')
  const [valor,           setValor]           = useState('')
  const [data,            setData]            = useState(new Date().toISOString().slice(0, 10))
  const [tipo,            setTipo]            = useState('parcial')
  const [obs,             setObs]             = useState('')
  const [saving,          setSaving]          = useState(false)

  const cobsFiltradas = useMemo(
    () => cobrancas.filter(c => c.contrato_id === contrato),
    [cobrancas, contrato]
  )

  const salvar = async () => {
    if (!cobranca || !valor || !data) return
    setSaving(true)
    await supabase.from('desembolsos').insert({
      user_id:          user.id,
      cobranca_id:      cobranca,
      classificacao_id: classificacaoId || null,
      valor:            parseFloat(valor.replace(',', '.')),
      data, tipo, obs: obs || null,
    })
    setSaving(false)
    onSaved()
    onClose()
  }

  const inpCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-400'

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-violet-500 rounded-t-2xl"/>
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Novo Desembolso</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Contrato / Imóvel *</label>
            <select value={contrato} onChange={e => { setContrato(e.target.value); setCobranca('') }} className={inpCls}>
              <option value="">Selecione…</option>
              {contratos.map(c => (
                <option key={c.id} value={c.id}>{c.imovel || c.tenant || c.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Cobrança (mês) *</label>
            <select value={cobranca} onChange={e => setCobranca(e.target.value)} className={inpCls} disabled={!contrato}>
              <option value="">Selecione…</option>
              {cobsFiltradas.map(c => (
                <option key={c.id} value={c.id}>{fmtMes(c.mes_referencia)} — {fmt(c.valor_total)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Classificação</label>
            <select value={classificacaoId} onChange={e => setClassificacaoId(e.target.value)} className={inpCls}>
              <option value="">— Sem classificação —</option>
              {classificacoes.map(cl => (
                <option key={cl.id} value={cl.id}>{cl.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Valor (R$) *</label>
              <input value={valor} onChange={e => setValor(e.target.value)} type="number" placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Data *</label>
              <input value={data} onChange={e => setData(e.target.value)} type="date"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"/>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inpCls}>
              <option value="parcial">Parcial</option>
              <option value="total">Total</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Observações</label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"/>
          </div>
          <button onClick={salvar} disabled={saving || !cobranca || !valor || !data}
            className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition">
            {saving ? 'Salvando…' : 'Salvar Desembolso'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal resultado da importação ───────────────────────────────────────────
function ImportResultModal({ result, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-violet-500 rounded-t-2xl"/>
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Resultado da Importação</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{result.ok}</p>
              <p className="text-xs text-emerald-600">Importados</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{result.skip}</p>
              <p className="text-xs text-amber-600">Ignorados</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
              <p className="text-xs text-red-600">Erros</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Erros / Avisos</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">{e}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────
export default function Desembolsos() {
  const { user } = useAuth()
  const fileRef  = useRef(null)

  const [desembolsos,    setDesembolsos]    = useState([])
  const [contratos,      setContratos]      = useState([])
  const [cobrancas,      setCobrancas]      = useState([])
  const [classificacoes, setClassificacoes] = useState([])
  const [loading,        setLoading]        = useState(true)
  const [expanded,       setExpanded]       = useState({})
  const [busca,          setBusca]          = useState('')
  const [novoModal,      setNovoModal]      = useState(false)
  const [importResult,   setImportResult]   = useState(null)
  const [importing,      setImporting]      = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)

    const [{ data: desemb }, { data: cobs }, { data: ctrs }, { data: cls }] = await Promise.all([
      supabase
        .from('desembolsos')
        .select('*, cobrancas(id, mes_referencia, valor_total, contrato_id, contratos(id, imovel, inquilinos(nome))), classificacoes_desembolso(nome)')
        .eq('user_id', user.id)
        .order('data', { ascending: false }),

      supabase
        .from('cobrancas')
        .select('id, contrato_id, mes_referencia, valor_total')
        .eq('user_id', user.id)
        .order('mes_referencia', { ascending: false }),

      supabase
        .from('contratos')
        .select('id, imovel, inquilinos(nome)')
        .eq('user_id', user.id)
        .order('imovel'),

      supabase
        .from('classificacoes_desembolso')
        .select('id, nome')
        .eq('user_id', user.id)
        .order('nome'),
    ])

    setDesembolsos(desemb || [])
    setCobrancas(cobs || [])
    setContratos((ctrs || []).map(c => ({
      id:     c.id,
      imovel: c.imovel || '—',
      tenant: c.inquilinos?.nome || '—',
    })))
    setClassificacoes(cls || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  // ── Agrupa por contrato → mês ────────────────────────────────────────────
  const grupos = useMemo(() => {
    const map = {}
    for (const d of desembolsos) {
      const cob   = d.cobrancas
      const ctr   = cob?.contratos
      const ctrId = cob?.contrato_id || 'sem-contrato'
      const mes   = cob?.mes_referencia || 'sem-mes'

      if (!map[ctrId]) {
        map[ctrId] = {
          contratoId: ctrId,
          imovel:     ctr?.imovel || '—',
          inquilino:  ctr?.inquilinos?.nome || '—',
          total:      0,
          count:      0,
          meses:      {},
        }
      }

      const g = map[ctrId]
      if (!g.meses[mes]) {
        g.meses[mes] = { mesRef: mes, total: 0, count: 0, lancamentos: [] }
      }

      const item = {
        id:            d.id,
        data:          d.data,
        valor:         Number(d.valor || 0),
        tipo:          d.tipo,
        obs:           d.obs,
        classificacao: d.classificacoes_desembolso?.nome || '—',
      }

      g.meses[mes].lancamentos.push(item)
      g.meses[mes].total += item.valor
      g.meses[mes].count++
      g.total += item.valor
      g.count++
    }

    return Object.values(map)
      .sort((a, b) => a.imovel.localeCompare(b.imovel))
      .map(g => ({
        ...g,
        meses: Object.values(g.meses).sort((a, b) =>
          (b.mesRef || '').localeCompare(a.mesRef || '')
        ),
      }))
  }, [desembolsos])

  const gruposFiltrados = useMemo(() => {
    if (!busca.trim()) return grupos
    const q = norm(busca)
    return grupos.filter(g => norm(g.imovel).includes(q) || norm(g.inquilino).includes(q))
  }, [grupos, busca])

  const totalGeral = useMemo(() => grupos.reduce((s, g) => s + g.total, 0), [grupos])

  // ── Importação Excel ─────────────────────────────────────────────────────
  // Colunas: IMÓVEL, MÊS REFERÊNCIA, VALOR, DATA, TIPO, CLASSIFICAÇÃO, OBSERVAÇÕES
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImporting(true)
    e.target.value = ''

    const buf  = await file.arrayBuffer()
    const wb   = XLSX.read(buf)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

    const norm2 = s => norm(s).replace(/\s+/g, ' ')

    const [{ data: ctrs }, { data: cobs }, { data: clsList }] = await Promise.all([
      supabase.from('contratos').select('id, imovel').eq('user_id', user.id),
      supabase.from('cobrancas').select('id, contrato_id, mes_referencia').eq('user_id', user.id),
      supabase.from('classificacoes_desembolso').select('id, nome').eq('user_id', user.id),
    ])

    let ok = 0, skip = 0
    const errors = []
    const inserts = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 2
      const rn = {}
      for (const [k, v] of Object.entries(r)) rn[k.toUpperCase().trim()] = v

      const imovelRaw = String(rn['IMÓVEL'] || rn['IMOVEL'] || rn['CONTRATO'] || '').trim()
      const mesRaw    = String(rn['MÊS REFERÊNCIA'] || rn['MES REFERENCIA'] || rn['MÊS'] || rn['MES'] || '').trim()
      const valorRaw  = String(rn['VALOR'] || '').replace(',', '.').trim()
      const dataRaw   = String(rn['DATA'] || '').trim()
      const tipo      = String(rn['TIPO'] || 'parcial').toLowerCase().trim()
      const clsRaw    = String(rn['CLASSIFICAÇÃO'] || rn['CLASSIFICACAO'] || '').trim()
      const obs       = String(rn['OBSERVAÇÕES'] || rn['OBSERVACOES'] || rn['OBS'] || '').trim()

      if (!imovelRaw) { skip++; continue }
      if (!valorRaw || isNaN(parseFloat(valorRaw))) {
        errors.push(`Linha ${rowNum}: valor inválido ("${rn['VALOR']}")`)
        continue
      }

      let dataISO = new Date().toISOString().slice(0, 10)
      if (dataRaw) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) {
          const [d, m, y] = dataRaw.split('/')
          dataISO = `${y}-${m}-${d}`
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dataRaw)) {
          dataISO = dataRaw
        } else {
          errors.push(`Linha ${rowNum}: data inválida ("${dataRaw}") — use DD/MM/AAAA`)
          continue
        }
      }

      const ctr = (ctrs || []).find(c => norm2(c.imovel) === norm2(imovelRaw))
      if (!ctr) {
        errors.push(`Linha ${rowNum}: imóvel não encontrado ("${imovelRaw}")`)
        continue
      }

      let cobId = null
      if (mesRaw) {
        let mesISO = mesRaw
        if (/^\d{1,2}\/\d{4}$/.test(mesRaw)) {
          const [m, y] = mesRaw.split('/')
          mesISO = `${y}-${m.padStart(2, '0')}`
        }
        const cob = (cobs || []).find(c => c.contrato_id === ctr.id && c.mes_referencia?.startsWith(mesISO))
        if (!cob) {
          errors.push(`Linha ${rowNum}: cobrança não encontrada para "${imovelRaw}" em ${mesRaw}`)
          continue
        }
        cobId = cob.id
      } else {
        const cobRecente = (cobs || [])
          .filter(c => c.contrato_id === ctr.id)
          .sort((a, b) => (b.mes_referencia || '').localeCompare(a.mes_referencia || ''))[0]
        if (!cobRecente) {
          errors.push(`Linha ${rowNum}: nenhuma cobrança encontrada para "${imovelRaw}"`)
          continue
        }
        cobId = cobRecente.id
      }

      // Classificação por nome (fuzzy)
      let clsId = null
      if (clsRaw) {
        const clsMatch = (clsList || []).find(c => norm2(c.nome) === norm2(clsRaw))
        if (clsMatch) clsId = clsMatch.id
        else errors.push(`Linha ${rowNum}: classificação "${clsRaw}" não encontrada — lançamento importado sem classificação`)
      }

      inserts.push({
        user_id:          user.id,
        cobranca_id:      cobId,
        classificacao_id: clsId,
        valor:            parseFloat(valorRaw),
        data:             dataISO,
        tipo:             ['parcial', 'total'].includes(tipo) ? tipo : 'parcial',
        obs:              obs || null,
      })
      ok++
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('desembolsos').insert(inserts)
      if (error) {
        errors.push(`Erro ao gravar: ${error.message}`)
        ok = 0
      }
    }

    setImporting(false)
    setImportResult({ ok, skip, errors })
    if (ok > 0) load()
  }

  // Dois níveis de expansão: contrato e (contrato+mês)
  const toggleCtr = id => setExpanded(p => ({ ...p, [id]: !p[id] }))
  const toggleMes = key => setExpanded(p => ({ ...p, [key]: !p[key] }))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Desembolsos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Valores desembolsados por contrato e mês</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setNovoModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition">
            + Novo lançamento
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition">
            {importing ? (
              <><span className="w-4 h-4 border-2 border-slate-300 border-t-violet-500 rounded-full animate-spin"/>Importando…</>
            ) : (
              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>Importar Excel</>
            )}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile}/>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-5 text-white">
          <p className="text-violet-200 text-xs font-semibold uppercase tracking-wide mb-1">Total Desembolsado</p>
          <p className="text-2xl font-bold">{fmt(totalGeral)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Contratos</p>
          <p className="text-2xl font-bold text-slate-800">{grupos.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">com desembolso registrado</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100">
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">Lançamentos</p>
          <p className="text-2xl font-bold text-slate-800">{desembolsos.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">registros no total</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Filtrar por imóvel ou inquilino…"
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"/>
      </div>

      {/* Tabela agrupada */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin"/>
          Carregando…
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">Nenhum desembolso encontrado</p>
          <p className="text-sm mt-1">Importe uma planilha ou adicione um lançamento manual.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="w-6"/>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Imóvel / Mês</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Inquilino</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Lançamentos</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {gruposFiltrados.map(g => (
                <>
                  {/* ── Linha do contrato ── */}
                  <tr key={g.contratoId}
                    onClick={() => toggleCtr(g.contratoId)}
                    className="border-b border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition">
                    <td className="pl-3 pr-1 py-3 text-slate-400 text-xs">{expanded[g.contratoId] ? '▾' : '▸'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{g.imovel}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{g.inquilino}</td>
                    <td className="px-3 py-3 text-right text-slate-400 text-xs">{g.count}</td>
                    <td className="px-3 py-3 text-right font-bold text-violet-700">{fmt(g.total)}</td>
                  </tr>

                  {/* ── Linhas de mês (visíveis quando contrato expandido) ── */}
                  {expanded[g.contratoId] && g.meses.map(m => {
                    const mesKey = `${g.contratoId}__${m.mesRef}`
                    return (
                      <>
                        <tr key={mesKey}
                          onClick={() => toggleMes(mesKey)}
                          className="border-b border-slate-50 hover:bg-violet-50 cursor-pointer transition">
                          <td className="pl-6 pr-1 py-2.5 text-violet-400 text-xs">{expanded[mesKey] ? '▾' : '▸'}</td>
                          <td className="px-3 py-2.5 text-slate-700 font-medium text-sm">
                            <span className="text-violet-500 mr-2">↳</span>{fmtMes(m.mesRef)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">—</td>
                          <td className="px-3 py-2.5 text-right text-slate-400 text-xs">{m.count}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-violet-600">{fmt(m.total)}</td>
                        </tr>

                        {/* ── Lançamentos do mês ── */}
                        {expanded[mesKey] && m.lancamentos.map(l => (
                          <tr key={l.id} className="border-b border-slate-50 bg-violet-50/40">
                            <td className="pl-12"/>
                            <td colSpan={4} className="px-3 py-2">
                              <div className="flex items-center gap-3 text-xs text-slate-600">
                                <span className="text-slate-400 shrink-0">{fmtDate(l.data)}</span>
                                {l.classificacao !== '—' && (
                                  <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium shrink-0">
                                    {l.classificacao}
                                  </span>
                                )}
                                <span className="capitalize text-slate-500 shrink-0">{l.tipo}</span>
                                {l.obs && <span className="text-slate-400 truncate">{l.obs}</span>}
                                <span className="ml-auto font-semibold text-violet-700 shrink-0">{fmt(l.valor)}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dica */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
        <span className="font-semibold text-slate-600">Formato da planilha:</span>{' '}
        colunas obrigatórias <strong>IMÓVEL</strong>, <strong>VALOR</strong>; opcionais <strong>MÊS REFERÊNCIA</strong> (YYYY-MM ou MM/AAAA), <strong>DATA</strong> (DD/MM/AAAA), <strong>CLASSIFICAÇÃO</strong>, <strong>TIPO</strong> (parcial/total), <strong>OBSERVAÇÕES</strong>.
      </div>

      {/* Modais */}
      {novoModal && (
        <NovoLancamentoModal
          contratos={contratos}
          cobrancas={cobrancas}
          classificacoes={classificacoes}
          onClose={() => setNovoModal(false)}
          onSaved={load}
        />
      )}
      {importResult && (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)}/>
      )}
    </div>
  )
}
