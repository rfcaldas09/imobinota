// Fonte única de verdade para municípios e alíquotas ISS
// Importado por OnboardingWizard e Config para manter sincronismo

// nac: true  = município aderiu ao Sistema Nacional NFS-e (endpoint SEFIN)
// nac: false = município usa sistema municipal próprio
export const MUNICIPIOS_SUL = [
  // ── SANTA CATARINA ──────────────────────────────────────────────────────────
  { ibge:'4205407', nome:'Florianópolis — SC', nac:true  },
  { ibge:'4204202', nome:'Chapecó — SC',        nac:true  },
  { ibge:'4202404', nome:'Blumenau — SC',        nac:true,  nacEm:'2026-08-01' },
  { ibge:'4209102', nome:'Joinville — SC',       nac:true,  nacEm:'2026-07-20' },
  { ibge:'4216602', nome:'São José — SC',        nac:false },
  { ibge:'4215802', nome:'São Bento do Sul — SC',nac:false },
  { ibge:'4211900', nome:'Palhoça — SC',         nac:false },
  // ── RIO GRANDE DO SUL ───────────────────────────────────────────────────────
  { ibge:'4314902', nome:'Porto Alegre — RS',    nac:true  },
  { ibge:'4305108', nome:'Caxias do Sul — RS',   nac:false },
  { ibge:'4316907', nome:'Santa Maria — RS',     nac:false },
  { ibge:'4314407', nome:'Pelotas — RS',         nac:true,  nacEm:'2026-08-01' },
  { ibge:'4309100', nome:'Gramado — RS',         nac:false },
  // ── PARANÁ ──────────────────────────────────────────────────────────────────
  { ibge:'4106902', nome:'Curitiba — PR',        nac:true  },
  { ibge:'4113700', nome:'Londrina — PR',        nac:true  },
  { ibge:'4115200', nome:'Maringá — PR',         nac:true  },
  { ibge:'4119905', nome:'Ponta Grossa — PR',    nac:false },
  { ibge:'4104808', nome:'Cascavel — PR',        nac:false },
]

// Alíquota ISS sugerida por município (confirmar com a prefeitura)
export const ISS_IBGE = {
  '4205407': '2,00', // Florianópolis SC
  '4204202': '2,00', // Chapecó SC
  '4202404': '2,00', // Blumenau SC
  '4209102': '2,00', // Joinville SC
  '4216602': '2,00', // São José SC
  '4215802': '2,00', // São Bento do Sul SC
  '4211900': '2,00', // Palhoça SC
  '4314902': '3,00', // Porto Alegre RS
  '4305108': '2,00', // Caxias do Sul RS
  '4314407': '2,00', // Pelotas RS
  '4309100': '5,00', // Gramado RS
  '4106902': '2,50', // Curitiba PR
  '4113700': '5,00', // Londrina PR
  '4115200': '5,00', // Maringá PR
  '4119905': '2,00', // Ponta Grossa PR
  '4104808': '2,00', // Cascavel PR
}
