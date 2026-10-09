/**
 * Reforma Tributária — Campos IBS/CBS para NFS-e Nacional
 *
 * Previsão de entrada em vigor:
 *   - Lucro Real / Presumido: obrigatório a partir de 03/08/2026
 *   - Simples Nacional / MEI: obrigatório a partir de 01/01/2027
 *
 * Referência:
 *   - Manual de Orientação do Contribuinte — NFS-e Nacional (SEFIN/CGNFS-e)
 *   - AnexoVII-IndOp_IBSCBS_V1.00.00 (cIndOp) — fonte: portal SEFIN NFS-e
 *   - AnexoVIII-CorrelacaoItemNBSIndOpCClassTrib_IBSCBS_V1.00.00.xlsx
 *
 * ATENÇÃO — Formato correto dos códigos:
 *   CST:    3 dígitos  (ex: '000', '040')  — portal exibe ex: "000 - Tributação integral"
 *   cIndOp: 6 dígitos  (ex: '030101')      — conforme AnexoVII oficial
 */

// ─── CST — Código de Situação Tributária (IBS/CBS) ───────────────────────────
// Tabela oficial SEFIN — 3 dígitos (NFS-e Nacional, LC 214/2025)
export const CST_OPTIONS = [
  { value: '000', label: '000 — Tributação integral pelo IBS e CBS' },
  { value: '020', label: '020 — Tributada com redução de base de cálculo' },
  { value: '040', label: '040 — Imune' },
  { value: '041', label: '041 — Não tributada — Fora do campo de incidência' },
  { value: '050', label: '050 — Suspensão' },
  { value: '060', label: '060 — Diferimento' },
  { value: '070', label: '070 — Exportação de serviços' },
  { value: '080', label: '080 — Regime Específico — Simples Nacional' },
  { value: '081', label: '081 — Regime Específico — Profissionais liberais (Decreto-lei 406/68)' },
  { value: '082', label: '082 — Regime Específico — Plano de saúde e seguro' },
  { value: '083', label: '083 — Regime Específico — Construção civil' },
  { value: '090', label: '090 — Outros' },
];

// ─── cIndOp — Indicador de Operação ──────────────────────────────────────────
// Fonte: AnexoVII-IndOp_IBSCBS_V1.00.00 (SEFIN/CGNFS-e)
// Códigos extraídos do AnexoVIII (correlação LC116 × NBS × IndOp)
export const CINDOP_OPTIONS = [
  // ── Serviços prestados PRESENCIALMENTE sobre a pessoa (art. 11, LC 214/2025)
  { value: '030101', label: '030101 — Serviço prestado fisicamente sobre a pessoa ou fruído presencialmente por PF — Local: estabelecimento do fornecedor' },
  { value: '030104', label: '030104 — Serviço prestado fisicamente sobre a pessoa (clínica/hospital/educação) — Local: onde ocorre o atendimento' },

  // ── Bens imóveis (locação, cessão, arrendamento)
  { value: '020101', label: '020101 — Bens imóveis — Locação / cessão onerosa / arrendamento (tipo I)' },
  { value: '020201', label: '020201 — Bens imóveis — Locação / cessão onerosa / arrendamento (tipo II)' },

  // ── Eventos, espetáculos, entretenimento (presencial)
  { value: '040101', label: '040101 — Espetáculos, eventos, atividades de entretenimento — Presencial' },

  // ── Regime regular — serviços B2B, SaaS, TI, consultoria, software (tomador no país)
  { value: '100301', label: '100301 — Serviço a destinatário no país — Regime regular (SaaS, TI, software, consultoria)' },

  // ── Bens imateriais / direitos (domicílio do adquirente)
  { value: '100501', label: '100501 — Bens imateriais / direitos / licenças de software — Domicílio do adquirente' },

  // ── Serviços agropecuários / insumos
  { value: '050101', label: '050101 — Serviços agropecuários e aquícolas — Insumos (tipo I)' },
  { value: '050104', label: '050104 — Serviços profissionais / agropecuários — Estabelecimento ou domicílio do tomador' },

  // ── Exportação de serviços
  { value: '070100', label: '070100 — Exportação de serviços — Tomador no exterior' },

  // ── Regimes específicos
  { value: '050100', label: '050100 — Simples Nacional — DASMEI (alíquota fixa)' },
  { value: '050201', label: '050201 — Simples Nacional — Tributação unificada (sublimite)' },
  { value: '060101', label: '060101 — Profissionais liberais (Dec-lei 406/68) — Tributação por valor fixo' },
  { value: '080101', label: '080101 — Construção civil — Serviço com ou sem material' },
  { value: '100101', label: '100101 — Zona Franca de Manaus / Área de Livre Comércio' },
];

// Mapeamento de CST antigo (2 dígitos) → CST novo (3 dígitos)
// Útil para migrar valores salvos no banco antes da correção
export const CST_MIGRATION = {
  '01': '000', '02': '020', '40': '040', '41': '041',
  '50': '050', '60': '060', '70': '070', '80': '080',
  '81': '081', '82': '082', '83': '083', '90': '090',
};

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
