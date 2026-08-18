/**
 * Reforma Tributária — Campos IBS/CBS para NFS-e Nacional
 *
 * Previsão de entrada em vigor:
 *   - Lucro Real / Presumido: obrigatório a partir de 03/08/2026
 *   - Simples Nacional / MEI: obrigatório a partir de 01/01/2027
 *
 * Referência: Manual de Orientação do Contribuinte — NFS-e Nacional (SEFIN/CGNFS-e)
 */

// ─── CST — Código de Situação Tributária (IBS/CBS) ───────────────────────────
// 18 códigos conforme Tabela de CST do SEFIN
export const CST_OPTIONS = [
  { value: '01', label: '01 — Tributada integralmente' },
  { value: '02', label: '02 — Tributada com redução de base de cálculo' },
  { value: '03', label: '03 — Tributada com redução de alíquota' },
  { value: '04', label: '04 — Tributada com redução de base de cálculo e de alíquota' },
  { value: '05', label: '05 — Tributada com crédito presumido' },
  { value: '06', label: '06 — Tributada com redução de base de cálculo e crédito presumido' },
  { value: '07', label: '07 — Tributada com redução de alíquota e crédito presumido' },
  { value: '08', label: '08 — Tributada com redução de base e de alíquota e crédito presumido' },
  { value: '40', label: '40 — Imune' },
  { value: '41', label: '41 — Não tributada' },
  { value: '50', label: '50 — Suspensão' },
  { value: '60', label: '60 — Diferimento' },
  { value: '70', label: '70 — Exportação' },
  { value: '80', label: '80 — Regime Específico — Simples Nacional' },
  { value: '81', label: '81 — Regime Específico — Profissionais liberais (Decreto-lei 406/68)' },
  { value: '82', label: '82 — Regime Específico — Plano de saúde e seguro' },
  { value: '83', label: '83 — Regime Específico — Construção civil' },
  { value: '90', label: '90 — Outros' },
];

// ─── cIndOp — Indicador de Operação ──────────────────────────────────────────
// Conforme Tabela de cIndOp do SEFIN
export const CINDOP_OPTIONS = [
  // 1. Regime Regular
  { value: '010100', label: '010100 — Regime Regular — Tributação integral' },
  { value: '010200', label: '010200 — Regime Regular — Redução de base de cálculo' },
  { value: '010300', label: '010300 — Regime Regular — Redução de alíquota' },
  { value: '010400', label: '010400 — Regime Regular — Redução de base e de alíquota' },
  { value: '010500', label: '010500 — Regime Regular — Crédito presumido' },
  { value: '010600', label: '010600 — Regime Regular — Redução de base e crédito presumido' },
  { value: '010700', label: '010700 — Regime Regular — Redução de alíquota e crédito presumido' },
  { value: '010800', label: '010800 — Regime Regular — Redução de base, alíquota e crédito presumido' },

  // 2. Não incidência / imunidade / isenção
  { value: '020100', label: '020100 — Imune — Entidade beneficente' },
  { value: '020200', label: '020200 — Imune — Outra imunidade' },
  { value: '020300', label: '020300 — Não tributada — Fora do campo de incidência' },

  // 3. Suspensão / diferimento
  { value: '030100', label: '030100 — Suspensão' },
  { value: '030200', label: '030200 — Diferimento' },

  // 4. Exportação
  { value: '040100', label: '040100 — Exportação de serviços' },

  // 5. Regime Específico — Simples Nacional
  { value: '050100', label: '050100 — Simples Nacional — DASMEI (alíquota fixa)' },
  { value: '050200', label: '050200 — Simples Nacional — Tributação unificada' },
  { value: '050300', label: '050300 — Simples Nacional — Sublimite ultrapassado' },

  // 6. Regime Específico — Profissionais liberais (Dec-lei 406/68)
  { value: '060100', label: '060100 — Profissionais liberais (Dec-lei 406/68) — Tributação por valor fixo' },

  // 7. Regime Específico — Plano de saúde e seguro
  { value: '070100', label: '070100 — Plano de saúde / seguro — Prêmio bruto' },
  { value: '070200', label: '070200 — Plano de saúde / seguro — Margem de contribuição' },

  // 8. Regime Específico — Construção civil
  { value: '080100', label: '080100 — Construção civil — Serviço com material' },
  { value: '080200', label: '080200 — Construção civil — Serviço sem material (empreitada pura)' },
  { value: '080300', label: '080300 — Construção civil — Subempreitada' },

  // 9. Operações com retenção na fonte (Responsabilidade Tributária do Tomador)
  { value: '090100', label: '090100 — Retenção integral pelo tomador' },
  { value: '090200', label: '090200 — Retenção parcial pelo tomador' },

  // 10. Operação em ZFM / ALC
  { value: '100100', label: '100100 — Zona Franca de Manaus — Venda a contribuinte' },
  { value: '100200', label: '100200 — Zona Franca de Manaus — Venda a não-contribuinte' },
  { value: '100300', label: '100300 — Área de Livre Comércio' },

  // 11. Outros
  { value: '990100', label: '990100 — Outros' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Retorna o label do CST pelo value, ou o próprio value se não encontrado */
export function cstLabel(value) {
  if (!value) return '';
  return CST_OPTIONS.find(o => o.value === value)?.label ?? value;
}

/** Retorna o label do cIndOp pelo value, ou o próprio value se não encontrado */
export function cindopLabel(value) {
  if (!value) return '';
  return CINDOP_OPTIONS.find(o => o.value === value)?.label ?? value;
}
