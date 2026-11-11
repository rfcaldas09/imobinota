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
  // LC 214/2025 — Reduções de alíquota (art. 127 e seguintes)
  { value: '200', label: '200 — Tributada com redução de alíquota do IBS e CBS (art. 127, LC 214/2025)' },
];

// ─── cIndOp — Indicador de Operação ──────────────────────────────────────────
// Fonte: AnexoVII-IndOp_IBSCBS_V1.00.00 (SEFIN/CGNFS-e)
// Códigos extraídos do AnexoVIII (correlação LC116 × NBS × IndOp)
export const CINDOP_OPTIONS = [
  // ── Serviços prestados FISICAMENTE sobre a pessoa (inc. III, art. 11, LC 214/2025)
  // Local: onde ocorre a prestação física do serviço
  { value: '030101', label: '030101 — Serviço prestado fisicamente sobre a pessoa — Local: estabelecimento do fornecedor' },
  { value: '030104', label: '030104 — Serviço prestado fisicamente sobre a pessoa — Local: endereço diverso (fornecedor/adquirente/destinatário)' },

  // ── Bens imóveis (inc. II, art. 11, LC 214/2025)
  // Local: onde o imóvel está situado
  { value: '020101', label: '020101 — Bem imóvel / bem imaterial relacionado a imóvel (operação onerosa) — Localidade do imóvel' },
  { value: '020201', label: '020201 — Serviço prestado fisicamente sobre bem imóvel — Localidade do imóvel' },

  // ── Eventos, espetáculos, entretenimento presenciais (inc. IV-a, art. 11)
  { value: '040101', label: '040101 — Evento / espetáculo / atividade de entretenimento presencial — Local do evento' },

  // ── Serviços físicos sobre bem MÓVEL (inc. III-b / art. 11, LC 214/2025)
  // Inclui: suporte técnico em TI, manutenção de equipamentos, reparos etc.
  // Válido para NBS 1.1501.30.00 (suporte TI) + LC 116 item 01.07 — Anexo VIII
  { value: '050101', label: '050101 — Serviço prestado fisicamente sobre bem móvel — Local: estabelecimento do fornecedor' },
  { value: '050104', label: '050104 — Serviço prestado fisicamente sobre bem móvel — Local: endereço diverso (fornecedor/adquirente/destinatário)' },

  // ── Demais serviços / serviços à distância (inc. IV, art. 11)
  // Código residual — cobre consultoria, serviços intelectuais, TI remoto etc.
  { value: '100301', label: '100301 — Demais serviços / serviços à distância — Domicílio principal do adquirente no país' },

  // ── Fornecimento integralmente via bem intangível (software, direitos, licenças)
  { value: '100501', label: '100501 — Fornecimento integralmente via bem intangível (software / direitos / licenças) — Domicílio principal do adquirente' },

  // ── Serviços sobre pessoa / fruídos presencialmente — domicílio do adquirente
  { value: '100101', label: '100101 — Serviço sobre a pessoa ou fruído presencialmente — Domicílio principal do adquirente' },

  // ── Exportação de serviços (tomador no exterior)
  { value: '070101', label: '070101 — Exportação de serviços (transporte de carga) — Endereço de entrega no exterior' },

  // ── Serviços portuários
  { value: '050201', label: '050201 — Serviços portuários — Local da prestação' },

  // ── Transporte de passageiros
  { value: '060101', label: '060101 — Serviço de transporte de passageiros — Local de início do transporte' },

  // ── Construção civil / exploração de via
  { value: '080101', label: '080101 — Serviço de exploração de via / construção civil — Local da prestação (proporcional ao território)' },
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
