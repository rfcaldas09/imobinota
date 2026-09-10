// Script: ativa plano PRO por 120 dias para um usuário
// Uso: node scripts/set-plano-pro.js
//
// Requer variáveis de ambiente:
//   SUPABASE_URL=https://xxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...
//
// Execute assim:
//   $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_KEY="eyJ..."; node scripts/set-plano-pro.js

const EMAIL     = 'rafael.fcaldas@gmail.com'
const PLANO     = 'pro'
const DIAS      = 120

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SVC) {
  console.error('❌ Defina SUPABASE_URL e SUPABASE_SERVICE_KEY antes de rodar o script.')
  process.exit(1)
}

async function main() {
  // 1. Busca o ID do usuário pelo e-mail
  const authRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`,
    { headers: { 'apikey': SUPABASE_SVC, 'Authorization': `Bearer ${SUPABASE_SVC}` } }
  )
  const authData = await authRes.json()
  const userId = authData?.users?.[0]?.id

  if (!userId) {
    console.error('❌ Usuário não encontrado para o e-mail:', EMAIL)
    process.exit(1)
  }
  console.log('✅ Usuário encontrado:', userId)

  // 2. Calcula datas
  const inicio = new Date()
  const fim    = new Date()
  fim.setDate(fim.getDate() + DIAS)

  // 3. Atualiza o perfil
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        SUPABASE_SVC,
        'Authorization': `Bearer ${SUPABASE_SVC}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        plano_tipo:  PLANO,
        plano_inicio: inicio.toISOString(),
        plano_fim:   fim.toISOString(),
      }),
    }
  )

  if (patchRes.ok) {
    console.log(`✅ Plano ${PLANO.toUpperCase()} ativado por ${DIAS} dias`)
    console.log(`   Início: ${inicio.toLocaleDateString('pt-BR')}`)
    console.log(`   Fim:    ${fim.toLocaleDateString('pt-BR')}`)
  } else {
    const err = await patchRes.text()
    console.error('❌ Erro ao atualizar perfil:', err)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ Erro inesperado:', err.message)
  process.exit(1)
})
