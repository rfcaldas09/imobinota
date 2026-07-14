import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ic = (d, cls='') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${cls}`}
    dangerouslySetInnerHTML={{ __html: d }} />
)
const IcSearch  = ({ c='' }) => ic('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', c)
const IcX       = ({ c='' }) => ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', c)
const IcMail    = ({ c='' }) => ic('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', c)
const IcPhone   = ({ c='' }) => ic('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.11h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6l.27-.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16z"/>', c)
const IcRefresh = ({ c='' }) => ic('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>', c)
const IcHome    = ({ c='' }) => ic('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', c)

const fmt     = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

const mapInquilino = row => ({
  id:       row.id,
  name:     row.nome     || '',
  cpf:      row.cpf      || '',
  email:    row.email    || '',
  phone:    row.telefone || '',
  contracts: (row.contratos || []).map(c => ({
    id:         c.id,
    property:   c.imovel        || '—',
    dueDay:     c.dia_vencimento,
    end:        c.data_fim,
    status:     c.status        || 'Ativo',
    totalValue: (Number(c.valor_aluguel) || 0)
              + (Number(c.seguro_financeiro) || 0)
              + (Number(c.seguro_incendio)   || 0)
              + (Number(c.iptu)              || 0),
  })),
})

// ── Badge de status de contrato ─────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    'Ativo':      'bg-emerald-50 text-emerald-700',
    'Encerrado':  'bg-slate-100  text-slate-500',
    'Em Atraso':  'bg-red-50     text-red-600',
    'Pendente':   'bg-amber-50   text-amber-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] || cfg['Ativo']}`}>
      {status}
    </span>
  )
}

export default function Inquilinos() {
  const { user } = useAuth()
  const [inquilinos, setInquilinos] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)

  const load = async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('inquilinos')
      .select(`
        id, nome, cpf, email, telefone,
        contratos (
          id, imovel, valor_aluguel, seguro_financeiro,
          seguro_incendio, iptu, dia_vencimento, data_fim, status
        )
      `)
      .eq('user_id', user.id)
      .order('nome', { ascending: true })

    if (!error) setInquilinos((data || []).map(mapInquilino))
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return inquilinos
    const qDigits = q.replace(/\D/g, '')
    return inquilinos.filter(i =>
      i.name.toLowerCase().includes(q)  ||
      i.email.toLowerCase().includes(q) ||
      (qDigits.length > 0 && i.cpf.replace(/\D/g,'').includes(qDigits)) ||
      (qDigits.length > 0 && i.phone.replace(/\D/g,'').includes(qDigits))
    )
  }, [search, inquilinos])

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Carregando…' : `${filtered.length} de ${inquilinos.length} cliente${inquilinos.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={load} disabled={loading} title="Atualizar"
          className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40">
          <IcRefresh c={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}/>
        </button>
      </div>

      {/* ── Busca ──────────────────────────────────────────── */}
      <div className="relative max-w-sm">
        <IcSearch c="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"/>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, CPF, e-mail, telefone…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"/>
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
            <IcX c="w-4 h-4"/>
          </button>
        )}
      </div>

      {/* ── Conteúdo ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
          <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin mr-3"/>
          Carregando clientes…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-4xl mb-3">{search ? '🔍' : '👤'}</p>
          <p className="text-slate-500 font-medium text-sm">
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="mt-2 text-indigo-600 text-sm hover:underline">
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(i => {
            const ativos  = i.contracts.filter(c => c.status !== 'Encerrado')
            const totalVal = ativos.reduce((s, c) => s + c.totalValue, 0)
            const hasOverdue = i.contracts.some(c => c.status === 'Em Atraso')
            return (
              <button key={i.id} onClick={() => setSelected(i)}
                className="bg-white rounded-2xl border border-slate-100 p-4 text-left hover:border-indigo-200 hover:shadow-md transition-all">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${hasOverdue ? 'bg-red-500' : 'bg-indigo-600'}`}>
                    {i.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{i.name}</p>
                    <p className="text-xs text-slate-400">{i.cpf || '—'}</p>
                  </div>
                  {hasOverdue && (
                    <span className="text-xs bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                      Em Atraso
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  {i.email && <div className="flex items-center gap-1.5"><IcMail c="w-3.5 h-3.5 flex-shrink-0"/><span className="truncate">{i.email}</span></div>}
                  {i.phone && <div className="flex items-center gap-1.5"><IcPhone c="w-3.5 h-3.5 flex-shrink-0"/>{i.phone}</div>}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-400">
                    {ativos.length} contrato{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}
                  </span>
                  {totalVal > 0 && (
                    <span className="text-sm font-bold text-slate-800">
                      {fmt(totalVal)}<span className="text-xs font-normal text-slate-400">/mês</span>
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Drawer de detalhe ──────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setSelected(null)}/>
          <div className="w-full max-w-sm bg-white h-full shadow-2xl overflow-y-auto flex flex-col">

            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Perfil do Cliente</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-700">
                <IcX c="w-5 h-5"/>
              </button>
            </div>

            <div className="p-5 space-y-5 flex-1">

              {/* Avatar + nome */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {selected.name[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg leading-tight">{selected.name}</p>
                  <p className="text-sm text-slate-500">{selected.cpf || 'CPF não informado'}</p>
                </div>
              </div>

              {/* Contato */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <IcMail c="w-4 h-4 text-slate-400 flex-shrink-0"/>
                  <span className="truncate">{selected.email || 'E-mail não informado'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <IcPhone c="w-4 h-4 text-slate-400 flex-shrink-0"/>
                  {selected.phone || 'Telefone não informado'}
                </div>
              </div>

              {/* Contratos */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">
                  Contratos ({selected.contracts.length})
                </p>
                {selected.contracts.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    <IcHome c="w-8 h-8 mx-auto mb-2 text-slate-200"/>
                    Sem contratos vinculados
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selected.contracts.map(c => (
                      <div key={c.id} className="border border-slate-200 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-slate-800 leading-snug">{c.property}</p>
                          <StatusBadge status={c.status}/>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>
                            {c.dueDay ? `Venc. dia ${c.dueDay}` : ''}
                            {c.dueDay && c.end ? ' · ' : ''}
                            {c.end ? `Término ${fmtDate(c.end)}` : ''}
                            {!c.dueDay && !c.end ? '—' : ''}
                          </span>
                          <span className="font-semibold text-slate-700">{fmt(c.totalValue)}/mês</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
