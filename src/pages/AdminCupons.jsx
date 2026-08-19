import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────
const fmtBRL  = n => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`
const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
const fmtDateTime = d => d ? new Date(d).toLocaleString('pt-BR') : '—'

// ── Página de administração (Cupons + Usuários) ───────────────────
// Rota: /admin/cupons  (não aparece na sidebar — acesso direto pela URL)
export default function AdminCupons() {
  const [tab, setTab] = useState('cupons') // 'cupons' | 'usuarios'

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Painel Administrativo</h1>
        <p className="text-sm text-slate-500">Acesso restrito ao administrador</p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'cupons',   label: '🎟️ Cupons' },
          { id: 'usuarios', label: '👥 Usuários' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'cupons'   && <TabCupons />}
      {tab === 'usuarios' && <TabUsuarios />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Aba Cupons (código original, sem alterações)
// ═══════════════════════════════════════════════════════════════════
function TabCupons() {
  const [cupons, setCupons]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [success, setSuccess] = useState('')

  const [novoCodigo, setNovoCodigo] = useState('')
  const [novoValor, setNovoValor]   = useState('')
  const [formError, setFormError]   = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error: err } = await supabase
      .from('cupons').select('*').order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setCupons(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const syncStripe = async (action, codigo, valorMensal) => {
    try {
      await fetch('/.netlify/functions/cupom-stripe-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, codigo, valorMensal }),
      })
    } catch (e) { console.warn('[AdminCupons] Stripe sync falhou:', e.message) }
  }

  const handleCreate = async (e) => {
    e.preventDefault(); setFormError(''); setSuccess('')
    const codigo = novoCodigo.trim().toUpperCase()
    const valor  = parseFloat(novoValor.replace(',', '.'))
    if (!codigo) { setFormError('Código é obrigatório'); return }
    if (!/^[A-Z0-9]{2,20}$/.test(codigo)) { setFormError('Código deve ter 2–20 caracteres alfanuméricos'); return }
    if (!valor || valor <= 0) { setFormError('Valor mensal inválido'); return }
    setSaving(true)
    const { error: err } = await supabase.from('cupons').insert({ codigo, valor_mensal: valor })
    if (err) {
      setSaving(false)
      setFormError(err.message.includes('unique') ? 'Código já existe' : err.message)
      return
    }
    await syncStripe('create', codigo, valor)
    setSaving(false); setNovoCodigo(''); setNovoValor('')
    setSuccess(`Cupom "${codigo}" criado com sucesso!`)
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  const handleToggle = async (cupom) => {
    const novoAtivo = !cupom.ativo
    const { error: err } = await supabase.from('cupons').update({ ativo: novoAtivo }).eq('id', cupom.id)
    if (err) { setError(err.message); return }
    if (novoAtivo) await syncStripe('recreate', cupom.codigo, cupom.valor_mensal)
    else           await syncStripe('delete', cupom.codigo)
    setCupons(prev => prev.map(c => c.id === cupom.id ? { ...c, ativo: novoAtivo } : c))
  }

  return (
    <div className="space-y-5">
      {/* Formulário de criação */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="font-semibold text-slate-900 mb-4">Novo cupom</p>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Código</label>
            <input type="text" value={novoCodigo}
              onChange={e => { setNovoCodigo(e.target.value.toUpperCase()); setFormError('') }}
              placeholder="EX: PARCEIRO10" maxLength={20}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 font-mono"/>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Valor mensal (R$)</label>
            <input type="text" value={novoValor}
              onChange={e => { setNovoValor(e.target.value); setFormError('') }}
              placeholder="Ex: 147,00"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"/>
          </div>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
            {saving ? 'Salvando…' : '+ Criar cupom'}
          </button>
        </form>
        {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        {success   && <p className="mt-2 text-xs text-emerald-600">{success}</p>}
      </div>

      {/* Lista */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
            Carregando…
          </div>
        ) : error ? (
          <div className="px-5 py-4 text-sm text-red-600">{error}</div>
        ) : cupons.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">Nenhum cupom cadastrado ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Código</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor/mês</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Usos</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Criado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cupons.map(c => (
                <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.ativo ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3 font-mono font-semibold text-slate-800">{c.codigo}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmtBRL(c.valor_mensal)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{c.usos}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                      c.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">{fmtDate(c.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleToggle(c)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2">
                      {c.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Aba Usuários
// ═══════════════════════════════════════════════════════════════════
function TabUsuarios() {
  const [usuarios, setUsuarios]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [errosModal, setErrosModal] = useState(null)
  const [busca, setBusca]           = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('ativos') // 'ativos' | 'inativos' | 'todos'
  const [toggling, setToggling]     = useState(null) // '<id>-ativo' | '<id>-contab'

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Sessão expirada')
      const res = await fetch('/.netlify/functions/admin-stats', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setUsuarios(json.usuarios || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const patchUser = async (userId, patch) => {
    const token = await getToken()
    const res = await fetch('/.netlify/functions/admin-stats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, ...patch }),
    })
    if (!res.ok) throw new Error('Erro ao atualizar')
  }

  const handleToggleAtivo = async (u) => {
    setToggling(`${u.id}-ativo`)
    try {
      await patchUser(u.id, { admin_ativo: !u.admin_ativo })
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, admin_ativo: !u.admin_ativo } : x))
    } catch (e) { alert(e.message) }
    finally { setToggling(null) }
  }

  const handleToggleContabilidade = async (u) => {
    setToggling(`${u.id}-contab`)
    try {
      await patchUser(u.id, { is_contabilidade: !u.is_contabilidade })
      setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, is_contabilidade: !u.is_contabilidade } : x))
    } catch (e) { alert(e.message) }
    finally { setToggling(null) }
  }

  // Filtra por ativo/inativo/busca
  const ativos = usuarios.filter(u => u.admin_ativo !== false)
  const filtrados = usuarios.filter(u => {
    const ativoOk = filtroAtivo === 'todos'
      ? true
      : filtroAtivo === 'ativos'
        ? u.admin_ativo !== false
        : u.admin_ativo === false
    if (!ativoOk) return false
    if (!busca) return true
    const q = busca.toLowerCase()
    return u.company?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.cnpj?.includes(q)
  })

  // KPIs só contam usuários ativos
  const totalEmitido = ativos.reduce((a, u) => a + (u.total_emitido || 0), 0)
  const totalAvOk    = ativos.reduce((a, u) => a + (u.avulsa_ok || 0), 0)
  const totalRecOk   = ativos.reduce((a, u) => a + (u.rec_ok || 0), 0)
  const totalCert    = ativos.filter(u => u.cert_ok).length

  const planoLabel = (p) => {
    if (!p) return <span className="text-xs text-slate-400">—</span>
    const cores = {
      mensal:    'bg-indigo-100 text-indigo-700',
      semestral: 'bg-violet-100 text-violet-700',
      anual:     'bg-emerald-100 text-emerald-700',
    }
    return (
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cores[p] || 'bg-slate-100 text-slate-600'}`}>
        {p}
      </span>
    )
  }

  return (
    <div className="space-y-5">

      {/* KPIs — apenas usuários ativos */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Usuários ativos', value: ativos.length,        color: 'text-slate-900' },
          { label: 'Com cert. A1',    value: totalCert,            color: 'text-emerald-700' },
          { label: 'Avulsas OK',      value: totalAvOk,            color: 'text-indigo-700' },
          { label: 'Recorrentes OK',  value: totalRecOk,           color: 'text-violet-700' },
          { label: 'Total emitido',   value: fmtBRL(totalEmitido), color: 'text-slate-900' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros + busca */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filtro ativo/inativo */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { id: 'ativos',   label: 'Ativos' },
            { id: 'inativos', label: 'Inativos' },
            { id: 'todos',    label: 'Todos' },
          ].map(f => (
            <button key={f.id} onClick={() => setFiltroAtivo(f.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filtroAtivo === f.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por empresa, e-mail ou CNPJ…"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"/>
        <button onClick={load}
          className="px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-700">
          ↻ Atualizar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-14 text-slate-400 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin"/>
            Carregando dados…
          </div>
        ) : error ? (
          <div className="px-6 py-6 text-sm text-red-600">{error}</div>
        ) : filtrados.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-400">Nenhum usuário encontrado.</div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empresa / E-mail</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CNPJ</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cert A1</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plano</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avulsa ✅</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avulsa ❌</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recorr. ✅</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total emitido</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cadastro</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contabil.</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtrados.map(u => (
                <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${u.admin_ativo === false ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800 leading-tight">{u.company}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.cnpj}</td>
                  <td className="px-4 py-3 text-center">
                    {u.cert_ok
                      ? <span title="Certificado configurado" className="text-base">✅</span>
                      : <span title="Sem certificado"        className="text-base">❌</span>}
                  </td>
                  <td className="px-4 py-3 text-center">{planoLabel(u.plano)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${u.avulsa_ok > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {u.avulsa_ok}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.avulsa_erro > 0 ? (
                      <button onClick={() => setErrosModal({ company: u.company, erros: u.avulsa_erros })}
                        className="font-semibold text-red-600 hover:text-red-800 underline underline-offset-2">
                        {u.avulsa_erro}
                      </button>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${u.rec_ok > 0 ? 'text-violet-700' : 'text-slate-400'}`}>
                      {u.rec_ok}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {u.total_emitido > 0 ? fmtBRL(u.total_emitido) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleContabilidade(u)}
                      disabled={toggling === `${u.id}-contab`}
                      title={u.is_contabilidade ? 'Desativar modo contabilidade' : 'Ativar modo contabilidade'}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                        u.is_contabilidade
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600'
                      }`}>
                      {toggling === `${u.id}-contab` ? '…' : u.is_contabilidade ? '✓ Ativo' : '— Off'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleAtivo(u)}
                      disabled={toggling === `${u.id}-ativo`}
                      title={u.admin_ativo !== false ? 'Ocultar usuário' : 'Reativar usuário'}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 ${
                        u.admin_ativo !== false
                          ? 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                      }`}>
                      {toggling === `${u.id}-ativo` ? '…' : u.admin_ativo !== false ? 'Ocultar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de erros */}
      {errosModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Erros de emissão avulsa</h3>
                <p className="text-sm text-slate-500 mt-0.5">{errosModal.company}</p>
              </div>
              <button onClick={() => setErrosModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-3">
              {errosModal.erros.map((e, i) => (
                <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs text-red-500 font-semibold mb-1">{fmtDateTime(e.data)}</p>
                  <pre className="text-xs text-red-800 whitespace-pre-wrap font-mono leading-relaxed">{e.msg}</pre>
                </div>
              ))}
              {errosModal.erros.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum detalhe de erro disponível.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
