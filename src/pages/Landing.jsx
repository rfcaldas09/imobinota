import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// ── WhatsApp SVG icon ──────────────────────────────────────────────
function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

// ── Input reutilizável (fora do AccessCard para não recriar a cada render) ──
function Inp({ value, onChange, type='text', placeholder }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white"/>
  )
}

// ── Login / Signup card inline ──────────────────────────────────────
function AccessCard() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]       = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm]     = useState({ firstName:'', lastName:'', company:'', email:'', whatsapp:'', password:'' })
  const set = k => e => { setError(''); setForm(p => ({ ...p, [k]: e.target.value })) }

  const handleLogin = async () => {
    if (!form.email || !form.password) { setError('Preencha e-mail e senha.'); return }
    setLoading(true); setError('')
    try {
      const { error: err } = await signIn(form.email, form.password)
      if (err) throw err
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Credenciais inválidas. Tente novamente.')
    } finally { setLoading(false) }
  }

  const handleSignup = async () => {
    if (!form.email || !form.password || !form.company) { setError('Preencha todos os campos obrigatórios.'); return }
    setLoading(true); setError('')
    try {
      const { error: err } = await signUp(form.email, form.password, {
        company_name: form.company,
        first_name: form.firstName,
        last_name: form.lastName,
      })
      if (err) throw err
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Erro ao criar conta. Tente novamente.')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-auto lg:mx-0">
      {/* Tab switcher */}
      <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
        {[['login','Entrar'],['signup','Criar conta']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setError('') }}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'login' ? (
        <div>
          <div className="space-y-4 mb-5">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label>
              <Inp value={form.email} onChange={set('email')} type="email" placeholder="seu@email.com.br"/>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-500">Senha</label>
                <a href="#" className="text-xs text-indigo-600 hover:underline">Esqueceu?</a>
              </div>
              <Inp value={form.password} onChange={set('password')} type="password" placeholder="••••••••"/>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}
          <button onClick={handleLogin} disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors mb-4 disabled:opacity-60">
            {loading ? 'Entrando...' : 'Entrar na plataforma'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Não tem conta?{' '}
            <button onClick={() => { setTab('signup'); setError('') }} className="text-indigo-600 font-semibold hover:underline">
              Crie grátis
            </button>
          </p>
        </div>
      ) : (
        <div>
          <div className="space-y-3 mb-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nome</label>
                <Inp value={form.firstName} onChange={set('firstName')} placeholder="João"/>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Sobrenome</label>
                <Inp value={form.lastName} onChange={set('lastName')} placeholder="Silva"/>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Nome da empresa *</label>
              <Inp value={form.company} onChange={set('company')} placeholder="Silva Imóveis Ltda"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">E-mail</label>
              <Inp value={form.email} onChange={set('email')} type="email" placeholder="seu@email.com.br"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">WhatsApp</label>
              <Inp value={form.whatsapp} onChange={set('whatsapp')} type="tel" placeholder="(47) 9 9999-9999"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Senha</label>
              <Inp value={form.password} onChange={set('password')} type="password" placeholder="••••••••"/>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}
          <button onClick={handleSignup} disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors mb-3 disabled:opacity-60">
            {loading ? 'Criando conta...' : 'Criar conta grátis — 14 dias grátis'}
          </button>
          <p className="text-center text-xs text-slate-400">
            Já tem conta?{' '}
            <button onClick={() => { setTab('login'); setError('') }} className="text-indigo-600 font-semibold hover:underline">
              Entrar
            </button>
          </p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400 justify-center">
        <span>✅ Sem cartão de crédito</span>
        <span>·</span>
        <span>✅ Cancele quando quiser</span>
      </div>
    </div>
  )
}

// ── Mockup: Dashboard preview ───────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 w-full max-w-2xl">
      {/* Barra topo */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="w-3 h-3 rounded-full bg-red-400"/>
        <div className="w-3 h-3 rounded-full bg-amber-400"/>
        <div className="w-3 h-3 rounded-full bg-emerald-400"/>
        <span className="text-slate-400 text-xs ml-3 font-mono">notafacil.com.br/dashboard</span>
      </div>
      <div className="flex">
        {/* Sidebar mini */}
        <div className="w-12 bg-white border-r border-slate-100 py-4 flex flex-col items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-[9px] font-black">IN</div>
          {['🏠','📋','💰','📈','👥','⚙️'].map((e,i) => (
            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${i===0?'bg-indigo-50':''}`}>{e}</div>
          ))}
        </div>
        {/* Conteúdo */}
        <div className="flex-1 p-3 bg-slate-50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Dashboard — Julho 2026</p>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              {label:'Arrecadado',value:'R$ 48.320',color:'text-emerald-600',bg:'bg-emerald-50',bar:78},
              {label:'Em Atraso',value:'R$ 3.200',color:'text-red-500',bg:'bg-red-50',bar:12},
              {label:'Adimplência',value:'96,8%',color:'text-indigo-600',bg:'bg-indigo-50',bar:97},
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-xl p-2.5`}>
                <p className={`${k.color} font-bold text-sm`}>{k.value}</p>
                <p className="text-slate-500 text-[10px] mt-0.5">{k.label}</p>
                <div className="h-1 bg-white/60 rounded-full mt-1.5 overflow-hidden">
                  <div className={`h-full ${k.color.replace('text-','bg-')} rounded-full`} style={{width:`${k.bar}%`}}/>
                </div>
              </div>
            ))}
          </div>
          {/* Tabela contratos */}
          <div className="bg-white rounded-xl overflow-hidden">
            <div className="grid grid-cols-4 px-3 py-1.5 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
              <span>Cliente</span><span>Imóvel</span><span className="text-right">Valor</span><span className="text-center">Status</span>
            </div>
            {[
              ['Maria S.','Ap. 302 – Beira-Mar','R$ 1.850','Pago','emerald'],
              ['João P.','Casa – Itoupava','R$ 2.100','Pendente','amber'],
              ['Ana R.','Kitnet – Centro','R$ 1.600','Em Atraso','red'],
              ['Carlos M.','Sala 14 – Centro Emp.','R$ 3.400','Pago','emerald'],
            ].map(([n,p,v,s,c]) => (
              <div key={n} className="grid grid-cols-4 px-3 py-1.5 items-center border-t border-slate-50">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[9px] font-bold">{n[0]}</div>
                  <span className="text-[10px] text-slate-700 font-medium truncate">{n}</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate">{p}</span>
                <span className="text-[10px] text-slate-700 font-semibold text-right">{v}</span>
                <div className="flex justify-center">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-${c}-100 text-${c}-700`}>{s}</span>
                </div>
              </div>
            ))}
          </div>
          {/* Botão */}
          <button className="mt-2 w-full bg-indigo-600 text-white text-[10px] font-bold py-2 rounded-lg">
            ⚡ Gerar e Enviar Tudo — Boleto + NFS-e
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mockup: Contrato ────────────────────────────────────────────────
function ContratoMockup() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <span className="text-xs font-bold text-slate-600">📋 Contratos</span>
        <div className="flex gap-1">
          {['Todos','Pago','Pendente','Em Atraso','Por Vencer'].map((f,i) => (
            <span key={f} className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${i===0?'bg-indigo-600 text-white':'text-slate-400'}`}>{f}</span>
          ))}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        {[
          ['R.F.','Ap 204 – Centro','R$2.200','Pago'],
          ['S.M.','Casa Vila Nova','R$1.750','Pendente'],
          ['A.L.','Sala 08 – Empresarial','R$3.100','Em Atraso'],
        ].map(([n,p,v,s]) => {
          const c = s==='Pago'?'emerald':s==='Pendente'?'amber':'red'
          return (
            <div key={n} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50">
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[9px] font-bold">{n[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-800">{n}</p>
                <p className="text-[9px] text-slate-400 truncate">{p}</p>
              </div>
              <span className="text-[10px] font-bold text-slate-700">{v}</span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-${c}-100 text-${c}-700`}>{s}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mockup: Disparo ─────────────────────────────────────────────────
function DisparoMockup() {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
        <span className="text-xs font-bold text-slate-600">⚡ Disparo em Massa</span>
      </div>
      <div className="p-3">
        <div className="flex justify-between text-[10px] mb-2">
          <span className="text-slate-500">Enviando boleto + NFS-e...</span>
          <span className="text-indigo-600 font-bold">87%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{width:'87%'}}/>
        </div>
        <div className="space-y-1">
          {[['Maria S.','✅ Enviado'],['João P.','✅ Enviado'],['Ana R.','⏳ Enviando...']].map(([n,s]) => (
            <div key={n} className="flex items-center justify-between text-[10px]">
              <span className="text-slate-600">{n}</span>
              <span className={s.includes('✅')?'text-emerald-600':'text-amber-500'}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const goSignup = () => navigate('/login')

  return (
    <div className="font-sans antialiased text-slate-700">

      {/* ── ALERT BAR ── */}
      <div className="bg-amber-500 text-white text-sm py-2.5 text-center font-medium px-4">
        ⚠️&nbsp; A NFS-e Nacional obrigatória entra em vigor em <strong>1º de agosto de 2026</strong>. Sua gestora está preparada?&nbsp;
        <a href="#regulacao" className="underline font-bold ml-2 hover:text-amber-100">Saiba mais →</a>
      </div>

      {/* ── NAV ── */}
      <nav className="bg-white/95 backdrop-blur sticky top-0 z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/logo-notafacil.png" alt="NotaFacil" className="h-9 w-auto"
              onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
            <div className="hidden items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">IN</div>
              <span className="font-bold text-slate-900 text-lg">Imobi<span className="text-indigo-600">Nota</span></span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-500">
            <a href="#problema" className="hover:text-slate-900 transition-colors">O Problema</a>
            <a href="#solucao"   className="hover:text-slate-900 transition-colors">A Solução</a>
            <a href="#planos"    className="hover:text-slate-900 transition-colors">Planos</a>
            <a href="#contato"   className="hover:text-slate-900 transition-colors">Contato</a>
          </div>
          <button onClick={goSignup}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
            Entrar na plataforma
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ background: 'linear-gradient(135deg, #0d1b2a 0%, #0f3d52 60%, #1a8fb5 100%)' }}
        className="min-h-screen flex items-center py-16">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/90 text-xs font-semibold px-4 py-2 rounded-full mb-6">
              🚨 Regulação NFS-e Nacional — 1º de agosto de 2026
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
              Gerencie seus{' '}
              <span style={{background:'linear-gradient(90deg,#38bdf8,#1a8fb5)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>
                aluguéis com
              </span>
              <br/>boleto e NFS-e automático
            </h1>
            <p className="text-slate-300 text-lg leading-relaxed mb-8">
              Boletos, NFS-e e cobranças automáticas para gestoras de imóveis. Já com a nova NFS-e Nacional integrada —{' '}
              <strong className="text-white">sem multas e sem correria de última hora.</strong>
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              {['✅ Boleto automático','📄 NFS-e integrada','💸 PIX instantâneo','📧 Envio por e-mail'].map(t => (
                <span key={t} className="bg-white/10 border border-white/15 text-white/85 text-sm px-3 py-1.5 rounded-full">{t}</span>
              ))}
            </div>
            {/* Social proof */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[['C','rose'],['R','violet'],['A','sky'],['M','amber']].map(([l,c]) => (
                  <div key={l} className={`w-9 h-9 rounded-full bg-${c}-400 border-2 border-[#0d1b2a] flex items-center justify-center text-white text-xs font-bold`}>{l}</div>
                ))}
              </div>
              <div>
                <p className="text-white text-sm font-bold">+120 gestoras ativas</p>
                <p className="text-slate-400 text-xs">Santa Catarina · Paraná · Rio Grande do Sul</p>
              </div>
            </div>
          </div>

          {/* Right: login/signup card */}
          <AccessCard/>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-slate-900 py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              {value:'+3.200',label:'Contratos gerenciados'},
              {value:'R$ 4,2M',label:'Em aluguéis processados/mês'},
              {value:'98%',label:'Adimplência média dos clientes'},
              {value:'2h → 5min',label:'Tempo de fechamento mensal'},
            ].map(s => (
              <div key={s.label}>
                <p className="text-3xl font-black text-white mb-1">{s.value}</p>
                <p className="text-slate-400 text-sm">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── REGULAÇÃO URGÊNCIA ── */}
      <section id="regulacao" className="py-16 bg-amber-50 border-y border-amber-200">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <span className="inline-flex items-center gap-2 bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-full mb-4">
              ⚠️ PRAZO URGENTE
            </span>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3">
              A NFS-e Nacional é obrigatória a partir de <span className="text-amber-600">1º de agosto de 2026</span>
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Gestoras que não se adaptarem estarão sujeitas a multas e impossibilidade de emitir cobranças. O NotaFacil já está pronto.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            {[
              {icon:'📄',title:'NFS-e Nacional integrada',desc:'Emissão automática para cada contrato, direto pelo painel. Sem acessar o portal da prefeitura.'},
              {icon:'🔐',title:'Certificado A1 gerenciado',desc:'Armazenamos e renovamos seu certificado digital com segurança. Você não precisa se preocupar.'},
              {icon:'⚡',title:'Disparo em massa em 1 clique',desc:'Gere e envie boleto + NFS-e para todos os clientes de uma vez. De horas para menos de 5 minutos.'},
            ].map(c => (
              <div key={c.title} className="bg-white border border-amber-100 rounded-2xl p-6 shadow-sm">
                <span className="text-3xl mb-4 block">{c.icon}</span>
                <h3 className="font-bold text-slate-900 mb-2">{c.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <button onClick={goSignup}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg shadow-amber-200">
              Regularize agora — 14 dias grátis →
            </button>
          </div>
        </div>
      </section>

      {/* ── SCREENSHOTS do sistema ── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-3 block">Plataforma</span>
            <h2 className="text-3xl font-black text-slate-900 mb-3">Tudo que você precisa, numa só tela</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Dashboard completo com contratos, cobranças e NFS-e integrados.</p>
          </div>
          {/* Dashboard principal */}
          <div className="flex justify-center mb-8">
            <DashboardMockup/>
          </div>
          {/* Dois mockups menores */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">📋 Gestão de Contratos</p>
              <ContratoMockup/>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">⚡ Disparo em Massa</p>
              <DisparoMockup/>
            </div>
          </div>
        </div>
      </section>

      {/* ── DORES ── */}
      <section id="problema" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-red-500 mb-3 block">O Problema</span>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Sua gestão de aluguéis ainda é assim?</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">Planilhas, ligações e processos manuais que consomem horas e geram erros.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {icon:'📊',title:'Controles em planilha',desc:'Dados espalhados em Excel, WhatsApp e e-mail. Sem histórico confiável, sem visibilidade real.'},
              {icon:'🧾',title:'Boletos um por um',desc:'Gerar boleto manualmente para cada cliente todo mês. Processo lento, sujeito a erros e esquecimentos.'},
              {icon:'📄',title:'NFS-e manual e demorada',desc:'Emitir nota fiscal para cada cliente no portal da prefeitura. Horas por mês perdidas sem necessidade.'},
              {icon:'📅',title:'Contratos vencendo sem aviso',desc:'Sem alertas automáticos, contratos vencem e ficam em situação irregular sem que ninguém perceba.'},
              {icon:'😰',title:'Inadimplência invisível',desc:'Sem dashboard, é difícil saber quem está em atraso. A inadimplência cresce em silêncio.'},
              {icon:'📁',title:'Documentos físicos perdidos',desc:'Contratos em papel ou arquivos soltos no computador. Sem centralização, qualquer auditoria vira caos.'},
            ].map(d => (
              <div key={d.title} className="border border-slate-100 rounded-2xl p-6 hover:border-red-100 hover:bg-red-50/30 transition-all">
                <span className="text-3xl mb-4 block">{d.icon}</span>
                <h3 className="font-bold text-slate-900 mb-2">{d.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOLUÇÃO ── */}
      <section id="solucao" className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-3 block">A Solução</span>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Uma plataforma. Zero planilha.</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">O NotaFacil resolve cada uma dessas dores — e ainda te prepara para a nova regulação.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {icon:'📋',color:'indigo',title:'Gestão completa de contratos',desc:'Cadastre clientes, imóveis e contratos em minutos. Tudo centralizado, organizado e acessível de qualquer lugar.'},
              {icon:'⚡',color:'purple',title:'Disparo em massa com 1 clique',desc:'Gere boletos + NFS-e para todos os contratos do mês e envie por e-mail automaticamente. De horas para minutos.'},
              {icon:'📈',color:'emerald',title:'Dashboard financeiro completo',desc:'Acompanhe adimplência, valores em aberto e histórico de pagamentos com gráficos claros e em tempo real.'},
              {icon:'🔔',color:'amber',title:'Alertas de contratos vencendo',desc:'Receba avisos automáticos de contratos próximos do vencimento. Negocie e renove com antecedência, sem surpresas.'},
              {icon:'💸',color:'sky',title:'PIX com baixa automática',desc:'Clientes pagam via PIX e a baixa é registrada automaticamente. Sem conferência manual, sem trabalho extra.'},
              {icon:'🗂️',color:'slate',title:'Digitalização de contratos',desc:'Suba e armazene contratos em PDF com segurança. Acesse qualquer documento a qualquer hora, de qualquer dispositivo.'},
            ].map(f => (
              <div key={f.title} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
                <div className={`w-12 h-12 rounded-xl bg-${f.color}-100 flex items-center justify-center text-2xl mb-4`}>{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-3 block">Como Funciona</span>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Simples assim</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">Comece a operar em menos de 5 minutos. Sem treinamento, sem complexidade.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {num:'1',title:'Cadastre seus contratos uma vez',desc:'Importe ou cadastre manualmente clientes, imóveis e valores. Feito isso, nunca mais precisará repetir.'},
              {num:'2',title:'Clique em "Gerar e Enviar Tudo"',desc:'Um clique gera boleto + NFS-e e dispara por e-mail para todos os clientes automaticamente.'},
              {num:'3',title:'Acompanhe pagamentos em tempo real',desc:'O dashboard atualiza à medida que os pagamentos chegam. Veja quem pagou, quem está pendente e quem está em atraso.'},
            ].map(s => (
              <div key={s.num} className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white text-2xl font-black flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-200">
                  {s.num}
                </div>
                <h3 className="font-bold text-slate-900 mb-3 text-lg">{s.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTOS ── */}
      <section className="py-20 bg-indigo-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-500 mb-3 block">Depoimentos</span>
            <h2 className="text-3xl font-black text-slate-900 mb-2">Gestoras que já transformaram sua rotina</h2>
            <p className="text-slate-500 text-sm">Avaliação média <strong className="text-slate-700">4,9 de 5</strong> ★★★★★</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {name:'Marcos A.',role:'Gestora de Imóveis — Blumenau',quote:'"Antes levava 3 dias para emitir boleto e nota de todos os clientes. Hoje faço em 5 minutos. Não tem como voltar atrás."',initial:'M',destaque:false},
              {name:'Carla S.',role:'Proprietária — Joinville',quote:'"A NFS-e integrada foi o que me convenceu. Já estava preocupada com a nova regulação de agosto — o NotaFacil resolveu isso e muito mais."',initial:'C',destaque:true},
              {name:'Ricardo P.',role:'Gestor Independente — Curitiba',quote:'"O dashboard de inadimplência me deu visibilidade que eu nunca tive. Reduzi meu atraso em 40% no primeiro mês."',initial:'R',destaque:false},
            ].map(t => (
              <div key={t.name} className={`rounded-2xl p-6 relative ${t.destaque ? 'border-2 border-indigo-400 bg-white shadow-lg shadow-indigo-100' : 'border border-slate-100 bg-white'}`}>
                {t.destaque && (
                  <div className="absolute -top-3 left-6 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">Destaque</div>
                )}
                <div className="text-amber-400 text-sm mb-3">★★★★★</div>
                <p className="text-slate-600 text-sm leading-relaxed mb-5 italic">{t.quote}</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">{t.initial}</div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                    <p className="text-xs text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANOS ── */}
      <section id="planos" className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-3 block">Planos</span>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Simples e transparente</h2>
            <p className="text-slate-500">Pague apenas pelo que usar. Sem fidelidade, sem surpresa.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Essencial */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Essencial</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-black text-slate-900">R$ 297</span>
                <span className="text-slate-400 text-sm mb-1">/mês</span>
              </div>
              <p className="text-xs text-slate-400 mb-5">+ R$1,20 por boleto pago</p>
              <ul className="space-y-3 mb-8 text-sm text-slate-600">
                {['Até 100 contratos','Boleto automático','NFS-e Nacional','Disparo em massa por e-mail','Dashboard financeiro','Relatórios + Inadimplência','Suporte por e-mail'].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-emerald-500 font-bold">✓</span> {f}</li>
                ))}
              </ul>
              <button onClick={goSignup}
                className="w-full border-2 border-indigo-600 text-indigo-600 font-bold py-3 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors">
                Começar grátis
              </button>
            </div>
            {/* Profissional */}
            <div className="bg-indigo-600 rounded-2xl p-8 relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-amber-400 text-slate-900 text-xs font-bold px-3 py-1 rounded-full">Mais popular</div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-2">Profissional</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-black text-white">R$ 497</span>
                <span className="text-indigo-300 text-sm mb-1">/mês</span>
              </div>
              <p className="text-xs text-indigo-300 mb-5">+ R$1,20 por boleto pago</p>
              <ul className="space-y-3 mb-8 text-sm text-indigo-100">
                {['Contratos ilimitados','Tudo do Essencial','Multi-usuário (até 5)','Relatórios avançados','API para integrações','Suporte prioritário','Gestor de conta dedicado'].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-amber-400 font-bold">✓</span> {f}</li>
                ))}
              </ul>
              <button onClick={goSignup}
                className="w-full bg-white hover:bg-indigo-50 text-indigo-700 font-bold py-3 rounded-xl transition-colors">
                Começar grátis
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{background:'linear-gradient(135deg,#1a8fb5,#0d1b2a)'}} className="py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <p className="text-amber-400 font-bold text-sm mb-3">🚨 Faltam poucos dias para 1º de agosto</p>
          <h2 className="text-3xl font-black text-white mb-4">Não espere a multa chegar</h2>
          <p className="text-slate-300 mb-8">
            Configuração em menos de 5 minutos. Já esteja em conformidade com a NFS-e Nacional antes do prazo obrigatório.
          </p>
          <button onClick={goSignup}
            className="bg-white hover:bg-slate-100 text-indigo-700 font-bold px-10 py-4 rounded-xl text-lg transition-colors shadow-lg">
            Começar grátis por 14 dias →
          </button>
          <p className="text-slate-400 text-sm mt-4">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer id="contato" className="bg-slate-900 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/logo-notafacil.png" alt="NotaFacil" className="h-9 w-auto" style={{filter:'brightness(0) invert(1)'}}
                  onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
                <div className="hidden items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">IN</div>
                  <span className="font-bold text-white text-lg">Imobi<span className="text-indigo-400">Nota</span></span>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Plataforma de gestão de imóveis com boleto, NFS-e e PIX automático para todo o Brasil.
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-4">Produto</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#solucao" className="hover:text-white transition-colors">Funcionalidades</a></li>
                <li><a href="#planos" className="hover:text-white transition-colors">Planos e preços</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentação</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status do sistema</a></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-4">Contato</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li className="flex items-center gap-2">📧 <span>comercial@techlinker.com.br</span></li>
                <li className="flex items-center gap-2">📱 <span>(47) 99179-7774</span></li>
                <li className="flex items-center gap-2">🌐 <span>techlinker.com.br</span></li>
                <li className="flex items-center gap-2">📍 <span>Blumenau, SC</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500">© 2026 TechLinker Soluções. Todos os direitos reservados.</p>
            <div className="flex gap-5 text-xs text-slate-500">
              <a href="#" className="hover:text-slate-300 transition-colors">Privacidade</a>
              <a href="#" className="hover:text-slate-300 transition-colors">Termos de uso</a>
              <a href="#" className="hover:text-slate-300 transition-colors">LGPD</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── BOTÃO FLUTUANTE WHATSAPP ── */}
      <a href="https://wa.me/5547991797774?text=Olá!%20Tenho%20interesse%20no%20TechLinker%20NotaFacil."
        target="_blank" rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
        title="Falar no WhatsApp">
        <WaIcon/>
      </a>
    </div>
  )
}
