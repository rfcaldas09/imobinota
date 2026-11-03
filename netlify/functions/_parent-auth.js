/**
 * _parent-auth.js
 * Helper compartilhado para validar que o caller (via JWT) tem permissão
 * para operar sobre o userId informado no body.
 *
 * Regras:
 *   - Se não há JWT → permite (retrocompatível com chamadas sem auth)
 *   - Se JWT === userId → permite (usuário operando sobre si mesmo)
 *   - Se JWT !== userId → verifica se profiles[userId].parent_user_id === jwtUserId
 *     - Se sim → permite
 *     - Se não → retorna { statusCode: 403, ... }
 *
 * Retorna null se autorizado, ou o objeto de resposta de erro se não autorizado.
 */

async function checkParentAuth(event, userId) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) return null // sem config, segue em frente

  const authHeader = (event.headers.authorization || event.headers.Authorization || '').trim()
  if (!authHeader.startsWith('Bearer ')) return null // sem JWT, permite (retrocompatível)

  const callerToken = authHeader.slice(7).trim()
  if (!callerToken) return null

  try {
    // Busca o usuário dono do JWT usando a API de auth do Supabase (service role)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${callerToken}`,
      },
    })
    if (!userRes.ok) return null // JWT inválido/expirado → permite (não bloqueia)
    const userData = await userRes.json()
    const callerId = userData?.id
    if (!callerId) return null

    // Mesmo usuário → autorizado
    if (callerId === userId) return null

    // Usuário diferente: verifica se caller é pai do target
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=parent_user_id`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!profRes.ok) return { statusCode: 403, body: JSON.stringify({ error: 'Não autorizado' }) }
    const profiles = await profRes.json()
    const targetProfile = profiles[0]

    if (targetProfile?.parent_user_id === callerId) return null // caller é o pai → autorizado

    console.warn(`[parent-auth] Acesso negado: caller=${callerId} não é pai de userId=${userId}`)
    return { statusCode: 403, body: JSON.stringify({ error: 'Não autorizado: você não é o responsável deste afiliado' }) }
  } catch (err) {
    console.error('[parent-auth] Erro ao validar autorização:', err?.message)
    return null // em caso de erro, não bloqueia (fail-open para não quebrar fluxos existentes)
  }
}

module.exports = { checkParentAuth }
