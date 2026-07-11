import { supabase } from './supabase'

export const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

/** "2026-07-01" — primeiro dia do mês da data fornecida */
export const mesStr = date =>
  new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10)

/** "Julho/2026" */
export const mesLabel = date =>
  `${MESES[date.getMonth()]}/${date.getFullYear()}`

/** "2026-07-10" — data de vencimento real (dia dentro do mês de referência) */
const dataVenc = (mesRef, dueDay) => {
  if (!dueDay) return null
  return new Date(mesRef.getFullYear(), mesRef.getMonth(), dueDay)
    .toISOString().slice(0, 10)
}

/**
 * Emite cobranças em lote para o mês de referência.
 * Contratos que já têm cobrança no mês são automaticamente ignorados.
 * @returns {{ created: number, skipped: number, error: string|null }}
 */
export async function emitirCobrancas(userId, contracts, mesRef) {
  const ref = mesStr(mesRef)

  // Busca IDs que já têm cobrança neste mês
  const { data: existing } = await supabase
    .from('cobrancas')
    .select('contrato_id')
    .eq('user_id', userId)
    .eq('mes_referencia', ref)

  const existingIds = new Set((existing || []).map(e => e.contrato_id))
  const toCreate    = contracts.filter(c => !existingIds.has(c.id))
  const skipped     = contracts.length - toCreate.length

  if (!toCreate.length) return { created: 0, skipped, error: null }

  const { error } = await supabase.from('cobrancas').insert(
    toCreate.map(c => ({
      user_id:           userId,
      contrato_id:       c.id,
      inquilino_id:      c.inquilino_id      ?? null,
      mes_referencia:    ref,
      data_vencimento:   dataVenc(mesRef, c.dueDay),
      valor_aluguel:     c.value             ?? 0,
      seguro_financeiro: c.seguroFinanceiro  ?? 0,
      seguro_incendio:   c.seguroIncendio    ?? 0,
      iptu:              c.iptu              ?? 0,
      valor_total:       c.totalValue        ?? 0,
      dia_vencimento:    c.dueDay            ?? null,
      status:            'Pendente',
    }))
  )

  return { created: toCreate.length, skipped, error: error?.message ?? null }
}

/**
 * Emite cobrança de um único contrato.
 * @returns {{ created: boolean, already: boolean, error: string|null }}
 */
export async function emitirUmaCobranca(userId, contract, mesRef) {
  const ref = mesStr(mesRef)

  const { data: existing } = await supabase
    .from('cobrancas')
    .select('id')
    .eq('user_id', userId)
    .eq('contrato_id', contract.id)
    .eq('mes_referencia', ref)
    .maybeSingle()

  if (existing) return { created: false, already: true, error: null }

  const { error } = await supabase.from('cobrancas').insert({
    user_id:           userId,
    contrato_id:       contract.id,
    inquilino_id:      contract.inquilino_id  ?? null,
    mes_referencia:    ref,
    data_vencimento:   dataVenc(mesRef, contract.dueDay),
    valor_aluguel:     contract.value             ?? 0,
    seguro_financeiro: contract.seguroFinanceiro  ?? 0,
    seguro_incendio:   contract.seguroIncendio    ?? 0,
    iptu:              contract.iptu              ?? 0,
    valor_total:       contract.totalValue        ?? 0,
    dia_vencimento:    contract.dueDay            ?? null,
    status:            'Pendente',
  })

  return { created: !error, already: false, error: error?.message ?? null }
}
