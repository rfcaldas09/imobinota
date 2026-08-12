import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Página de administração de cupons ─────────────────────────────
// Rota: /admin/cupons  (não aparece na sidebar — acesso direto pela URL)
export default function AdminCupons() {
  const [cupons, setCupons]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [success, setSuccess]     = useState('')

  // Formulário de novo cupom
  const [novoCodigo, setNovoCodigo]         = useState('')
  const [novoValor, setNovoValor]           = useState('')
  const [formError, setFormError]           = useState('')

  const load = async () => {
    setLoading(true); setError('')
    const { data, error: err } = await supabase
      .from('cupons')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setCupons(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const fmtBRL = n => `R$ ${Number(n).toFixed(2).replace('.', ',')}`
  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  // ── Criar novo cupom ──────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    setFormError(''); setSuccess('')

    const codigo = novoCodigo.trim().toUpperCase()
    const valor  = parseFloat(novoValor.replace(',', '.'))

    if (!codigo) { setFormError('Código é obrigatório'); return }
    if (!/^[A-Z0-9]{2,20}$/.test(codigo)) { setFormError('Código deve ter 2–20 caracteres alfanuméricos'); return }
    if (!valor || valor <= 0) { setFormError('Valor mensal inválido'); return }

    setSaving(true)
    const { error: err } = await supabase
      .from('cupons')
      .insert({ codigo, valor_mensal: valor })
    setSaving(false)

    if (err) {
      setFormError(err.message.includes('unique') ? 'Código já existe' : err.message)
      return
    }

    setNovoCodigo(''); setNovoValor('')
    setSuccess(`Cupom "${codigo}" criado com sucesso!`)
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  // ── Toggle ativo / inativo ────────────────────────────────────
  const handleToggle = async (cupom) => {
    const { error: err } = await supabase
      .from('cupons')
      .update({ ativo: !cupom.ativo })
      .eq('id', cupom.id)
    if (err) { setError(err.message); return }
    setCupons(prev => prev.map(c => c.id === cupom.id ? { ...c, ativo: !c.ativo } : c))
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Cupons de Desconto</h1>
        <p className="text-sm text-slate-500">Gerencie códigos de desconto para assinaturas</p>
      </div>

      {/* ── Formulário de criação ───────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <p className="font-semibold text-slate-900 mb-4">Novo cupom</p>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Código</label>
            <input
              type="text"
              value={novoCodigo}
              onChange={e => { setNovoCodigo(e.target.value.toUpperCase()); setFormError('') }}
              placeholder="EX: PARCEIRO10"
              maxLength={20}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50 font-mono"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Valor mensal (R$)</label>
            <input
              type="text"
              value={novoValor}
              onChange={e => { setNovoValor(e.target.value); setFormError('') }}
              placeholder="Ex: 147,00"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {saving ? 'Salvando…' : '+ Criar cupom'}
          </button>
        </form>
        {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
        {success   && <p className="mt-2 text-xs text-emerald-600">{success}</p>}
      </div>

      {/* ── Lista de cupons ─────────────────────────────────────── */}
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
                      c.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">{fmtDate(c.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => handleToggle(c)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                    >
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
