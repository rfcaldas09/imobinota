// Tela de Inadimplência — somente is_contabilidade
// 3 abas: Lançamentos | Por Locatário | Resumo
import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────
const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—'

// Calcula valor atualizado: valor_original * (1 + pct_multa/100) * (1 + pct_juros_mes/100 * meses)
function calcValorAtualizado(valorOriginal, pctMulta, pctJurosMes, dataVencimento) {
  if (!valorOriginal) return 0
  const hoje = new Date()
  const venc  = dataVencimento ? new Date(dataVencimento + 'T12:00:00') : hoje
  const diasAtraso = Math.max(0, Math.floor((hoje - venc) / 86400000))
  if (diasAtraso === 0) return valorOriginal
  const multa  = valorOriginal * ((pctMulta || 0) / 100)
  const meses  = diasAtraso / 30
  const juros  = valorOriginal * ((pctJurosMes || 0) / 100) * meses
  return valorOriginal + multa + juros
}

const SITUACAO_COBRANCA_OPTS = [
  '', 'Cobrar', 'Atrasa todo mês', 'Cumprindo Acordo', 'Acordo Result',
  'Estava cumprindo acordo', 'Ajuizado', 'Despejo Urgente',
  'Enviado documentação', 'Pagou parcial',
]
const SITUACAO_LOCACAO_OPTS = ['Andamento', 'Em desocupação', 'Desocupado']

// ── Modal de Desembolso ───────────────────────────────────────────
function DesembolsoModal({ cob, onClose, onSaved }) {
  const { user } = useAuth()
  const [valor,           setValor]           = useState('')
  const [data,            setData]            = useState(new Date().toISOString().slice(0, 10))
  const [tipo,            setTipo]            = useState('parcial')
  const [obs,             setObs]             = useState('')
  const [classificacaoId, setClassificacaoId] = useState('')
  const [classificacoes,  setClassificacoes]  = useState([])
  const [saving,          setSaving]          = useState(false)
  const [lista,           setLista]           = useState([])

  useEffect(() => {
    if (!user) return
    supabase.from('desembolsos')
      .select('*')
      .eq('cobranca_id', cob.id)
      .order('data', { ascending: false })
      .then(({ data: d }) => setLista(d || []))
    supabase.from('classificacoes_desembolso')
      .select('id, nome')
      .eq('user_id', user.id)
      .order('nome')
      .then(({ data: cls }) => setClassificacoes(cls || []))
  }, [cob.id, user])

  const salvar = async () => {
    if (!valor || !data) return
    setSaving(true)
    await supabase.from('desembolsos').insert({
      user_id: user.id, cobranca_id: cob.id,
      classificacao_id: classificacaoId || null,
      valor: parseFloat(valor.replace(',', '.')),
      data, tipo, obs: obs || null,
    })
    // Recalcula situacao_desembolso
    const { data: todos } = await supabase.from('desembolsos')
      .select('valor').eq('cobranca_id', cob.id)
    const totalDesemb = (todos || []).reduce((s, r) => s + Number(r.valor), 0)
    const sit = totalDesemb >= (cob.valorOriginal || cob.totalValue || 0)
      ? 'Desembolsado' : totalDesemb > 0 ? 'Parcial' : 'Pendente'
    await supabase.from('cobrancas').update({ situacao_desembolso: sit }).eq('id', cob.id)
    setSaving(false)
    onSaved(sit)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="h-1 bg-emerald-500 rounded-t-2xl"/>
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Lançar Desembolso</h3>
            <p className="text-xs text-slate-400">{cob.tenant} · {cob.mesRef}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 pb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Valor (R$) *</label>
              <input value={valor} onChange={e => setValor(e.target.value)} type="number" placeholder="0,00"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Data *</label>
              <input value={data} onChange={e => setData(e.target.value)} type="date"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Classificação</label>
            <select value={classificacaoId} onChange={e => setClassificacaoId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="">— Sem classificação —</option>
              {classificacoes.map(cl => (
                <option key={cl.id} value={cl.id}>{cl.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
              <option value="parcial">Parcial</option>
              <option value="total">Total</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Observações</label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
          </div>
          {lista.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">Histórico de desembolsos</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lista.map(d => (
                  <div key={d.id} className="flex justify-between text-xs text-slate-600">
                    <span>{fmtDate(d.data)} — {d.tipo}</span>
                    <span className="font-semibold">{fmt(d.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">Cancelar</button>
            <button onClick={salvar} disabled={!valor || saving}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40">
              {saving ? 'Salvando…' : 'Lançar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Aba 1: Lançamentos ────────────────────────────────────────────
function AbaLancamentos({ lancamentos, onUpdateCob, onDesembolso }) {
  const [search,         setSearch]         = useState('')
  const [filtroLocacao,  setFiltroLocacao]  = useState('')
  const [filtroCobranca, setFiltroCobranca] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return lancamentos.filter(l => {
      if (q && !l.tenant.toLowerCase().includes(q) && !l.property.toLowerCase().includes(q)) return false
      if (filtroLocacao  && l.situacaoLocacao  !== filtroLocacao)  return false
      if (filtroCobranca && l.situacaoCobranca !== filtroCobranca) return false
      return true
    })
  }, [lancamentos, search, filtroLocacao, filtroCobranca])

  const diasAtraso = (dataVenc) => {
    if (!dataVenc) return null
    const dias = Math.floor((new Date() - new Date(dataVenc + 'T12:00:00')) / 86400000)
    return dias
  }

  const agingColor = (dias) => {
    if (!dias || dias <= 0) return 'text-slate-400'
    if (dias <= 30)  return 'text-yellow-600'
    if (dias <= 60)  return 'text-orange-500'
    if (dias <= 90)  return 'text-orange-600'
    if (dias <= 180) return 'text-red-500'
    return 'text-red-700 font-bold'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input type="text" placeholder="Filtrar por cliente ou imóvel…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 bg-white"/>
          <svg className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <select value={filtroLocacao} onChange={e => setFiltroLocacao(e.target.value)}
          className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 whitespace-nowrap">
          <option value="">Situação da Locação</option>
          {SITUACAO_LOCACAO_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filtroCobranca} onChange={e => setFiltroCobranca(e.target.value)}
          className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-400 whitespace-nowrap">
          <option value="">Situação da Cobrança</option>
          {SITUACAO_COBRANCA_OPTS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filtroLocacao || filtroCobranca) && (
          <button onClick={() => { setFiltroLocacao(''); setFiltroCobranca('') }}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1" title="Limpar filtros">×</button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Cliente / Imóvel</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Competência</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Vencimento</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">V. Original</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">V. Atualizado</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Atraso</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Situação Cob.</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Desembolso</th>
              <th className="px-3 py-3"/>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400 text-sm">Nenhum lançamento encontrado</td></tr>
            ) : filtered.map(l => {
              const dias = diasAtraso(l.dataVencimento)
              const vAtual = l.valorAtualizado || calcValorAtualizado(l.totalValue, l.pctMulta, l.pctJurosMes, l.dataVencimento)
              return (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 text-sm">{l.tenant}</p>
                    <p className="text-xs text-slate-400 truncate max-w-[200px]">{l.property}</p>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-slate-600">{l.mesRef}</td>
                  <td className="px-3 py-3 text-center text-xs text-slate-600">{fmtDate(l.dataVencimento)}</td>
                  <td className="px-3 py-3 text-right text-xs font-medium text-slate-700">{fmt(l.totalValue)}</td>
                  <td className="px-3 py-3 text-right text-xs font-semibold text-red-600">{fmt(vAtual)}</td>
                  <td className={`px-3 py-3 text-center text-xs font-semibold ${agingColor(dias)}`}>
                    {dias != null ? (dias <= 0 ? 'A vencer' : `${dias}d`) : '—'}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <select value={l.situacaoCobranca || ''}
                      onChange={e => onUpdateCob(l.id, 'situacao_cobranca', e.target.value)}
                      className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[120px]">
                      {SITUACAO_COBRANCA_OPTS.map(s => <option key={s} value={s}>{s || '—'}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      l.situacaoDesembolso === 'Desembolsado' ? 'bg-emerald-50 text-emerald-700' :
                      l.situacaoDesembolso === 'Parcial'      ? 'bg-amber-50 text-amber-700' :
                                                                'bg-slate-100 text-slate-500'
                    }`}>
                      {l.situacaoDesembolso || 'Pendente'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => onDesembolso(l)}
                      className="text-xs text-emerald-600 font-semibold hover:underline whitespace-nowrap">
                      + Desembolso
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Aba 2: Por Locatário ──────────────────────────────────────────
function AbaPorLocatario({ lancamentos, onUpdateCob, onUpdateLocacao }) {
  const grupos = useMemo(() => {
    const map = {}
    for (const l of lancamentos) {
      const key = l.tenant
      if (!map[key]) map[key] = {
        tenant: l.tenant, contratoId: l.contratoId, property: l.property,
        situacaoLocacao: l.situacaoLocacao, situacaoCobranca: l.situacaoCobranca,
        items: [], totalOriginal: 0, totalAtualizado: 0,
      }
      const vAtual = l.valorAtualizado || calcValorAtualizado(l.totalValue, l.pctMulta, l.pctJurosMes, l.dataVencimento)
      map[key].items.push(l)
      map[key].totalOriginal  += l.totalValue || 0
      map[key].totalAtualizado += vAtual
    }
    return Object.values(map).sort((a, b) => b.totalAtualizado - a.totalAtualizado)
  }, [lancamentos])

  const totalGeral = grupos.reduce((s, g) => s + g.totalAtualizado, 0)

  return (
    <div className="space-y-3">
      {grupos.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Nenhum locatário inadimplente</div>
      ) : grupos.map(g => (
        <div key={g.tenant} className="bg-white rounded-2xl border border-slate-100 p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800">{g.tenant}</p>
              <p className="text-xs text-slate-400 truncate">{g.property}</p>
              <p className="text-xs text-slate-500 mt-1">{g.items.length} lançamento{g.items.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <div className="text-right">
                <p className="text-xs text-slate-400">Original</p>
                <p className="text-sm font-semibold text-slate-700">{fmt(g.totalOriginal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Atualizado</p>
                <p className="text-sm font-bold text-red-600">{fmt(g.totalAtualizado)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">% do total</p>
                <p className="text-sm font-semibold text-slate-500">
                  {totalGeral > 0 ? `${((g.totalAtualizado / totalGeral) * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Situação Locação</label>
              <select value={g.situacaoLocacao || 'Andamento'}
                onChange={e => onUpdateLocacao(g.contratoId, e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                {SITUACAO_LOCACAO_OPTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Situação Cobrança</label>
              <select value={g.situacaoCobranca || ''}
                onChange={e => {
                  // atualiza todas as cobrancas deste locatário
                  g.items.forEach(l => onUpdateCob(l.id, 'situacao_cobranca', e.target.value))
                }}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
                {SITUACAO_COBRANCA_OPTS.map(s => <option key={s} value={s}>{s || '—'}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Aba 3: Resumo ─────────────────────────────────────────────────
function AbaResumo({ lancamentos, totalCarteira }) {
  const hoje = new Date()

  const stats = useMemo(() => {
    const tenants = new Set(lancamentos.map(l => l.tenant))
    let totalOriginal = 0, totalAtualizado = 0
    const aging = { d1_30: 0, d31_60: 0, d61_90: 0, d91_180: 0, d180: 0 }
    const agingVal = { d1_30: 0, d31_60: 0, d61_90: 0, d91_180: 0, d180: 0 }

    for (const l of lancamentos) {
      totalOriginal += l.totalValue || 0
      const vAtual = l.valorAtualizado || calcValorAtualizado(l.totalValue, l.pctMulta, l.pctJurosMes, l.dataVencimento)
      totalAtualizado += vAtual
      const dias = l.dataVencimento ? Math.floor((hoje - new Date(l.dataVencimento + 'T12:00:00')) / 86400000) : 1
      const bucket = dias <= 30 ? 'd1_30' : dias <= 60 ? 'd31_60' : dias <= 90 ? 'd61_90' : dias <= 180 ? 'd91_180' : 'd180'
      aging[bucket]++
      agingVal[bucket] += vAtual
    }

    return { total: lancamentos.length, tenants: tenants.size, totalOriginal, totalAtualizado, aging, agingVal }
  }, [lancamentos])

  const pctCarteira = totalCarteira > 0 ? (stats.totalAtualizado / totalCarteira * 100).toFixed(1) : '—'

  const agingRows = [
    { label: '1 a 30 dias',       key: 'd1_30',   color: 'text-yellow-600' },
    { label: '31 a 60 dias',      key: 'd31_60',  color: 'text-orange-500' },
    { label: '61 a 90 dias',      key: 'd61_90',  color: 'text-orange-600' },
    { label: '91 a 180 dias',     key: 'd91_180', color: 'text-red-500' },
    { label: 'Mais de 180 dias',  key: 'd180',    color: 'text-red-700' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* KPIs */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Resumo Geral</p>
        {[
          { label: 'Locatários inadimplentes',      val: stats.tenants },
          { label: 'Cobranças em atraso',           val: stats.total },
          { label: 'Valor original total',          val: fmt(stats.totalOriginal) },
          { label: 'Valor atualizado total',        val: fmt(stats.totalAtualizado), bold: true, red: true },
          { label: '% da carteira (valor)',         val: `${pctCarteira}%`, bold: true },
        ].map(({ label, val, bold, red }) => (
          <div key={label} className="flex justify-between items-center border-b border-slate-50 pb-2">
            <span className="text-sm text-slate-500">{label}</span>
            <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'} ${red ? 'text-red-600' : 'text-slate-800'}`}>{val}</span>
          </div>
        ))}
      </div>

      {/* Aging */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Aging da Inadimplência</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 uppercase tracking-wide">
              <th className="text-left pb-2">Faixa</th>
              <th className="text-center pb-2">Qtd</th>
              <th className="text-right pb-2">Valor</th>
              <th className="text-right pb-2">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {agingRows.map(({ label, key, color }) => (
              <tr key={key}>
                <td className={`py-2 text-xs ${color}`}>{label}</td>
                <td className="py-2 text-center text-xs text-slate-600">{stats.aging[key]}</td>
                <td className="py-2 text-right text-xs font-medium text-slate-700">{fmt(stats.agingVal[key])}</td>
                <td className="py-2 text-right text-xs text-slate-400">
                  {stats.totalAtualizado > 0 ? `${(stats.agingVal[key] / stats.totalAtualizado * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────
export default function Inadimplencia() {
  const { user, isContabilidade } = useAuth()
  const [aba, setAba]           = useState('lancamentos')
  const [lancamentos, setLancamentos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [totalCarteira, setTotalCarteira] = useState(0)
  const [desembolsoModal, setDesembolsoModal] = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Busca todas as cobranças não pagas com dados do contrato
    const { data: cobs } = await supabase
      .from('cobrancas')
      .select(`
        id, status, valor_total, valor_aluguel, mes_referencia, dia_vencimento,
        situacao_cobranca, valor_atualizado, situacao_desembolso,
        contratos(id, imovel, pct_multa, pct_juros_mes, situacao_locacao),
        inquilinos(nome)
      `)
      .eq('user_id', user.id)
      .neq('status', 'Pago')
      .order('mes_referencia', { ascending: false })

    // Valor total da carteira (todos os contratos ativos)
    const { data: ctrs } = await supabase
      .from('contratos')
      .select('valor_aluguel')
      .eq('user_id', user.id)
      .eq('status', 'Ativo')
    setTotalCarteira((ctrs || []).reduce((s, r) => s + (Number(r.valor_aluguel) || 0), 0))

    const rows = (cobs || []).map(c => {
      // Calcula data de vencimento a partir de mes_referencia + dia_vencimento
      let dataVencimento = null
      if (c.mes_referencia && c.dia_vencimento) {
        const [ano, mes] = c.mes_referencia.split('-')
        dataVencimento = `${ano}-${mes}-${String(c.dia_vencimento).padStart(2, '0')}`
      }
      return {
        id:               c.id,
        contratoId:       c.contratos?.id || null,
        tenant:           c.inquilinos?.nome || '—',
        property:         c.contratos?.imovel || '—',
        mesRef:           c.mes_referencia || '',
        dataVencimento,
        totalValue:       Number(c.valor_total) || 0,
        valorAtualizado:  Number(c.valor_atualizado) || null,
        pctMulta:         Number(c.contratos?.pct_multa) || 0,
        pctJurosMes:      Number(c.contratos?.pct_juros_mes) || 0,
        situacaoLocacao:  c.contratos?.situacao_locacao || 'Andamento',
        situacaoCobranca: c.situacao_cobranca || '',
        situacaoDesembolso: c.situacao_desembolso || 'Pendente',
      }
    })

    // Somente vencimentos no passado (inadimplentes de verdade)
    const hoje = new Date()
    const rowsPassadas = rows.filter(r => {
      if (!r.dataVencimento) return false
      return new Date(r.dataVencimento + 'T12:00:00') < hoje
    })

    setLancamentos(rowsPassadas)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const onUpdateCob = useCallback(async (id, campo, valor) => {
    await supabase.from('cobrancas').update({ [campo]: valor || null }).eq('id', id)
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, [campo === 'situacao_cobranca' ? 'situacaoCobranca' : campo]: valor } : l))
  }, [])

  const onUpdateLocacao = useCallback(async (contratoId, valor) => {
    if (!contratoId) return
    await supabase.from('contratos').update({ situacao_locacao: valor }).eq('id', contratoId)
    setLancamentos(prev => prev.map(l => l.contratoId === contratoId ? { ...l, situacaoLocacao: valor } : l))
  }, [])

  if (!isContabilidade) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-slate-400">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-sm font-medium">Disponível somente no modo contabilidade</p>
        </div>
      </div>
    )
  }

  const abas = [
    { key: 'lancamentos',   label: 'Lançamentos',   emoji: '📋' },
    { key: 'porlocatario',  label: 'Por Locatário', emoji: '👤' },
    { key: 'resumo',        label: 'Resumo',        emoji: '📊' },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inadimplência</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Carregando…' : `${lancamentos.length} lançamento${lancamentos.length !== 1 ? 's' : ''} em aberto`}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-50">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Atualizar
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              aba === a.key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span>{a.emoji}</span> {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin mr-3"/>
          Carregando inadimplência…
        </div>
      ) : (
        <>
          {aba === 'lancamentos'  && <AbaLancamentos lancamentos={lancamentos} onUpdateCob={onUpdateCob} onDesembolso={setDesembolsoModal}/>}
          {aba === 'porlocatario' && <AbaPorLocatario lancamentos={lancamentos} onUpdateCob={onUpdateCob} onUpdateLocacao={onUpdateLocacao}/>}
          {aba === 'resumo'       && <AbaResumo lancamentos={lancamentos} totalCarteira={totalCarteira}/>}
        </>
      )}

      {/* Modal desembolso */}
      {desembolsoModal && (
        <DesembolsoModal
          cob={desembolsoModal}
          onClose={() => setDesembolsoModal(null)}
          onSaved={(sit) => {
            setLancamentos(prev => prev.map(l => l.id === desembolsoModal.id ? { ...l, situacaoDesembolso: sit } : l))
          }}
        />
      )}
    </div>
  )
}
