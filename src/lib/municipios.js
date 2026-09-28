// Fonte única de verdade para municípios e alíquotas ISS
// Importado por OnboardingWizard e Config para manter sincronismo

// nac: true  = município usa o Emissor Nacional NFS-e (endpoint SEFIN)
// nac: false = município usa sistema municipal próprio (integração separada necessária)
// Fonte: planilha oficial gov.br/nfse atualizada em 18/09/2026
export const MUNICIPIOS_SUL = [
  // ── SANTA CATARINA — Sistema Nacional (201 municípios) ──────────────────────
  { ibge:'4209102', nome:'Joinville — SC',                      nac:true,  nacEm:'2026-07-20' },
  { ibge:'4205407', nome:'Florianópolis — SC',                  nac:true  },
  { ibge:'4202404', nome:'Blumenau — SC',                       nac:true,  nacEm:'2026-08-01' },
  { ibge:'4208203', nome:'Itajaí — SC',                         nac:true  },
  { ibge:'4204202', nome:'Chapecó — SC',                        nac:true  },
  { ibge:'4204608', nome:'Criciúma — SC',                       nac:true  },
  { ibge:'4208906', nome:'Jaraguá do Sul — SC',                 nac:true  },
  { ibge:'4202909', nome:'Brusque — SC',                        nac:true  },
  { ibge:'4202008', nome:'Balneário Camboriú — SC',             nac:true  },
  { ibge:'4218707', nome:'Tubarão — SC',                        nac:true  },
  { ibge:'4204301', nome:'Concórdia — SC',                      nac:true  },
  { ibge:'4208302', nome:'Itapema — SC',                        nac:true  },
  { ibge:'4205902', nome:'Gaspar — SC',                         nac:true  },
  { ibge:'4203006', nome:'Caçador — SC',                        nac:true  },
  { ibge:'4207007', nome:'Içara — SC',                          nac:true  },
  { ibge:'4207304', nome:'Imbituba — SC',                       nac:true  },
  { ibge:'4219507', nome:'Xanxerê — SC',                        nac:true  },
  { ibge:'4202107', nome:'Barra Velha — SC',                    nac:true  },
  { ibge:'4206504', nome:'Guaramirim — SC',                     nac:true  },
  { ibge:'4217204', nome:'São Miguel do Oeste — SC',            nac:true  },
  { ibge:'4209409', nome:'Laguna — SC',                         nac:true  },
  { ibge:'4203600', nome:'Campos Novos — SC',                   nac:true  },
  { ibge:'4213203', nome:'Pomerode — SC',                       nac:true  },
  { ibge:'4202800', nome:'Braço do Norte — SC',                 nac:true  },
  { ibge:'4216305', nome:'São João Batista — SC',               nac:true  },
  { ibge:'4205456', nome:'Forquilhinha — SC',                   nac:true  },
  { ibge:'4219705', nome:'Xaxim — SC',                          nac:true  },
  { ibge:'4213609', nome:'Porto União — SC',                    nac:true  },
  { ibge:'4209003', nome:'Joaçaba — SC',                        nac:true  },
  { ibge:'4217709', nome:'Sombrio — SC',                        nac:true  },
  { ibge:'4210506', nome:'Maravilha — SC',                      nac:true  },
  { ibge:'4215703', nome:'Santo Amaro da Imperatriz — SC',      nac:true  },
  { ibge:'4208500', nome:'Ituporanga — SC',                     nac:true  },
  { ibge:'4202453', nome:'Bombinhas — SC',                      nac:true  },
  { ibge:'4206306', nome:'Guabiruba — SC',                      nac:true  },
  { ibge:'4216909', nome:'São Lourenço do Oeste — SC',          nac:true  },
  { ibge:'4203956', nome:'Capivari de Baixo — SC',              nac:true  },
  { ibge:'4211702', nome:'Orleans — SC',                        nac:true  },
  { ibge:'4203907', nome:'Capinzal — SC',                       nac:true  },
  { ibge:'4208104', nome:'Itaiópolis — SC',                     nac:true  },
  { ibge:'4206702', nome:"Herval d'Oeste — SC",                 nac:true  },
  { ibge:'4219002', nome:'Urussanga — SC',                      nac:true  },
  { ibge:'4214003', nome:'Presidente Getúlio — SC',             nac:true  },
  { ibge:'4217402', nome:'Schroeder — SC',                      nac:true  },
  { ibge:'4217501', nome:'Seara — SC',                          nac:true  },
  { ibge:'4217808', nome:'Taió — SC',                           nac:true  },
  { ibge:'4206009', nome:'Governador Celso Ramos — SC',         nac:true  },
  { ibge:'4204251', nome:'Cocal do Sul — SC',                   nac:true  },
  { ibge:'4200101', nome:'Abelardo Luz — SC',                   nac:true  },
  { ibge:'4202073', nome:'Balneário Gaivota — SC',              nac:true  },
  { ibge:'4220000', nome:'Balneário Rincão — SC',               nac:true  },
  { ibge:'4201950', nome:'Balneário Arroio do Silva — SC',      nac:true  },
  { ibge:'4208401', nome:'Itapiranga — SC',                     nac:true  },
  { ibge:'4212106', nome:'Palmitos — SC',                       nac:true  },
  { ibge:'4205001', nome:'Dionísio Cerqueira — SC',             nac:true  },
  { ibge:'4209607', nome:'Lauro Müller — SC',                   nac:true  },
  { ibge:'4212254', nome:'Passo de Torres — SC',                nac:true  },
  { ibge:'4211504', nome:'Nova Trento — SC',                    nac:true  },
  { ibge:'4217006', nome:'São Ludgero — SC',                    nac:true  },
  { ibge:'4217600', nome:'Siderópolis — SC',                    nac:true  },
  { ibge:'4211603', nome:'Nova Veneza — SC',                    nac:true  },
  { ibge:'4215455', nome:'Sangão — SC',                         nac:true  },
  { ibge:'4218806', nome:'Turvo — SC',                          nac:true  },
  { ibge:'4203709', nome:'Canelinha — SC',                      nac:true  },
  { ibge:'4215109', nome:'Rodeio — SC',                         nac:true  },
  { ibge:'4206207', nome:'Gravatal — SC',                       nac:true  },
  { ibge:'4207205', nome:'Imaruí — SC',                         nac:true  },
  { ibge:'4210001', nome:'Luiz Alves — SC',                     nac:true  },
  { ibge:'4209706', nome:'Lebon Régis — SC',                    nac:true  },
  { ibge:'4200200', nome:'Agrolândia — SC',                     nac:true  },
  { ibge:'4214201', nome:'Quilombo — SC',                       nac:true  },
  { ibge:'4204707', nome:'Cunha Porã — SC',                     nac:true  },
  { ibge:'4218905', nome:'Urubici — SC',                        nac:true  },
  { ibge:'4206405', nome:'Guaraciaba — SC',                     nac:true  },
  { ibge:'4204004', nome:'Catanduvas — SC',                     nac:true  },
  { ibge:'4200705', nome:'Alfredo Wagner — SC',                 nac:true  },
  { ibge:'4213401', nome:'Ponte Serrada — SC',                  nac:true  },
  { ibge:'4204400', nome:'Coronel Freitas — SC',                nac:true  },
  { ibge:'4212650', nome:'Pescaria Brava — SC',                 nac:true  },
  { ibge:'4207809', nome:'Irani — SC',                          nac:true  },
  { ibge:'4216008', nome:'São Carlos — SC',                     nac:true  },
  { ibge:'4207908', nome:'Irineópolis — SC',                    nac:true  },
  { ibge:'4211009', nome:'Mondaí — SC',                         nac:true  },
  { ibge:'4201257', nome:'Apiúna — SC',                         nac:true  },
  { ibge:'4203501', nome:'Campo Erê — SC',                      nac:true  },
  { ibge:'4207650', nome:'Iporã do Oeste — SC',                 nac:true  },
  { ibge:'4212304', nome:'Paulo Lopes — SC',                    nac:true  },
  { ibge:'4216107', nome:'São Domingos — SC',                   nac:true  },
  { ibge:'4218509', nome:'Treze Tílias — SC',                   nac:true  },
  { ibge:'4201505', nome:'Armazém — SC',                        nac:true  },
  { ibge:'4216800', nome:'São José do Cerrito — SC',            nac:true  },
  { ibge:'4204905', nome:'Descanso — SC',                       nac:true  },
  { ibge:'4201703', nome:'Ascurra — SC',                        nac:true  },
  { ibge:'4209508', nome:'Laurentino — SC',                     nac:true  },
  { ibge:'4210407', nome:'Maracajá — SC',                       nac:true  },
  { ibge:'4217907', nome:'Tangará — SC',                        nac:true  },
  { ibge:'4215679', nome:'Santa Terezinha — SC',                nac:true  },
  { ibge:'4207700', nome:'Ipumirim — SC',                       nac:true  },
  { ibge:'4207684', nome:'Ipuaçu — SC',                         nac:true  },
  { ibge:'4211108', nome:'Monte Castelo — SC',                  nac:true  },
  { ibge:'4212007', nome:'Palma Sola — SC',                     nac:true  },
  { ibge:'4218400', nome:'Treze de Maio — SC',                  nac:true  },
  { ibge:'4218608', nome:'Trombudo Central — SC',               nac:true  },
  { ibge:'4218251', nome:'Timbó Grande — SC',                   nac:true  },
  { ibge:'4203402', nome:'Campo Belo do Sul — SC',              nac:true  },
  { ibge:'4208005', nome:'Itá — SC',                            nac:true  },
  { ibge:'4201901', nome:'Aurora — SC',                         nac:true  },
  { ibge:'4210803', nome:'Meleiro — SC',                        nac:true  },
  { ibge:'4200606', nome:'Águas Mornas — SC',                   nac:true  },
  { ibge:'4212700', nome:'Petrolândia — SC',                    nac:true  },
  { ibge:'4200408', nome:'Água Doce — SC',                      nac:true  },
  { ibge:'4216255', nome:'São João do Oeste — SC',              nac:true  },
  { ibge:'4203105', nome:'Caibi — SC',                          nac:true  },
  { ibge:'4206108', nome:'Grão-Pará — SC',                      nac:true  },
  { ibge:'4200309', nome:'Agronômica — SC',                     nac:true  },
  { ibge:'4216057', nome:'São Cristóvão do Sul — SC',           nac:true  },
  { ibge:'4214409', nome:'Rio das Antas — SC',                  nac:true  },
  { ibge:'4209151', nome:'José Boiteux — SC',                   nac:true  },
  { ibge:'4219200', nome:'Vidal Ramos — SC',                    nac:true  },
  { ibge:'4207403', nome:'Imbuia — SC',                         nac:true  },
  { ibge:'4200507', nome:'Águas de Chapecó — SC',               nac:true  },
  { ibge:'4217253', nome:'São Pedro de Alcântara — SC',         nac:true  },
  { ibge:'4200804', nome:'Anchieta — SC',                       nac:true  },
  { ibge:'4210035', nome:'Luzerna — SC',                        nac:true  },
  { ibge:'4202701', nome:'Botuverá — SC',                       nac:true  },
  { ibge:'4219358', nome:'Vitor Meireles — SC',                 nac:true  },
  { ibge:'4211405', nome:'Nova Erechim — SC',                   nac:true  },
  { ibge:'4204350', nome:'Cordilheira Alta — SC',               nac:true  },
  { ibge:'4205209', nome:'Erval Velho — SC',                    nac:true  },
  { ibge:'4218756', nome:'Tunápolis — SC',                      nac:true  },
  { ibge:'4214904', nome:'Rio Fortuna — SC',                    nac:true  },
  { ibge:'4206603', nome:'Guarujá do Sul — SC',                 nac:true  },
  { ibge:'4215075', nome:'Riqueza — SC',                        nac:true  },
  { ibge:'4215208', nome:'Romelândia — SC',                     nac:true  },
  { ibge:'4204103', nome:'Caxambu do Sul — SC',                 nac:true  },
  { ibge:'4211454', nome:'Nova Itaberaba — SC',                 nac:true  },
  { ibge:'4207601', nome:'Ipira — SC',                          nac:true  },
  { ibge:'4219176', nome:'Vargem Bonita — SC',                  nac:true  },
  { ibge:'4209854', nome:'Lindóia do Sul — SC',                 nac:true  },
  { ibge:'4201273', nome:'Arabutã — SC',                        nac:true  },
  { ibge:'4215406', nome:'Salto Veloso — SC',                   nac:true  },
  { ibge:'4208609', nome:'Jaborá — SC',                         nac:true  },
  { ibge:'4202859', nome:'Braço do Trombudo — SC',              nac:true  },
  { ibge:'4210902', nome:'Modelo — SC',                         nac:true  },
  { ibge:'4212270', nome:'Passos Maia — SC',                    nac:true  },
  { ibge:'4202503', nome:'Bom Jardim da Serra — SC',            nac:true  },
  { ibge:'4207759', nome:'Iraceminha — SC',                     nac:true  },
  { ibge:'4201109', nome:'Anitápolis — SC',                     nac:true  },
  { ibge:'4215356', nome:'Saltinho — SC',                       nac:true  },
  { ibge:'4201604', nome:'Arroio Trinta — SC',                  nac:true  },
  { ibge:'4219606', nome:'Xavantina — SC',                      nac:true  },
  { ibge:'4213005', nome:'Pinheiro Preto — SC',                 nac:true  },
  { ibge:'4205175', nome:'Entre Rios — SC',                     nac:true  },
  { ibge:'4203154', nome:'Calmon — SC',                         nac:true  },
  { ibge:'4217105', nome:'São Martinho — SC',                   nac:true  },
  { ibge:'4217550', nome:'Serra Alta — SC',                     nac:true  },
  { ibge:'4204178', nome:'Cerro Negro — SC',                    nac:true  },
  { ibge:'4206801', nome:'Ibicaré — SC',                        nac:true  },
  { ibge:'4201802', nome:'Atalanta — SC',                       nac:true  },
  { ibge:'4202081', nome:'Bandeirante — SC',                    nac:true  },
  { ibge:'4205605', nome:'Galvão — SC',                         nac:true  },
  { ibge:'4211256', nome:'Morro Grande — SC',                   nac:true  },
  { ibge:'4214151', nome:'Princesa — SC',                       nac:true  },
  { ibge:'4212601', nome:'Peritiba — SC',                       nac:true  },
  { ibge:'4204194', nome:'Chapadão do Lageado — SC',            nac:true  },
  { ibge:'4200556', nome:'Águas Frias — SC',                    nac:true  },
  { ibge:'4207577', nome:'Iomerê — SC',                         nac:true  },
  { ibge:'4217758', nome:'Sul Brasil — SC',                     nac:true  },
  { ibge:'4202537', nome:'Bom Jesus — SC',                      nac:true  },
  { ibge:'4218855', nome:'União do Oeste — SC',                 nac:true  },
  { ibge:'4218954', nome:'Urupema — SC',                        nac:true  },
  { ibge:'4215752', nome:'São Bernardino — SC',                 nac:true  },
  { ibge:'4202156', nome:'Belmonte — SC',                       nac:true  },
  { ibge:'4209177', nome:'Jupiá — SC',                          nac:true  },
  { ibge:'4211652', nome:'Novo Horizonte — SC',                 nac:true  },
  { ibge:'4203253', nome:'Capão Alto — SC',                     nac:true  },
  { ibge:'4212056', nome:'Palmeira — SC',                       nac:true  },
  { ibge:'4200051', nome:'Abdon Batista — SC',                  nac:true  },
  { ibge:'4219150', nome:'Vargem — SC',                         nac:true  },
  { ibge:'4201653', nome:'Arvoredo — SC',                       nac:true  },
  { ibge:'4215687', nome:'Santa Terezinha do Progresso — SC',   nac:true  },
  { ibge:'4217956', nome:'Tigrinhos — SC',                      nac:true  },
  { ibge:'4215554', nome:'Santa Helena — SC',                   nac:true  },
  { ibge:'4202875', nome:'Brunópolis — SC',                     nac:true  },
  { ibge:'4215059', nome:'Rio Rufino — SC',                     nac:true  },
  { ibge:'4214102', nome:'Presidente Nereu — SC',               nac:true  },
  { ibge:'4211892', nome:'Painel — SC',                         nac:true  },
  { ibge:'4210555', nome:'Marema — SC',                         nac:true  },
  { ibge:'4211850', nome:'Ouro Verde — SC',                     nac:true  },
  { ibge:'4215604', nome:'Santa Rosa de Lima — SC',             nac:true  },
  { ibge:'4207858', nome:'Irati — SC',                          nac:true  },
  { ibge:'4204459', nome:'Coronel Martins — SC',                nac:true  },
  { ibge:'4204756', nome:'Cunhataí — SC',                       nac:true  },
  { ibge:'4211876', nome:'Paial — SC',                          nac:true  },
  { ibge:'4205357', nome:'Flor do Sertão — SC',                 nac:true  },
  { ibge:'4208955', nome:'Jardinópolis — SC',                   nac:true  },
  { ibge:'4210050', nome:'Macieira — SC',                       nac:true  },
  { ibge:'4217154', nome:'São Miguel da Boa Vista — SC',        nac:true  },
  { ibge:'4209458', nome:'Lajeado Grande — SC',                 nac:true  },
  { ibge:'4215695', nome:'Santiago do Sul — SC',                nac:true  },
  { ibge:'4213906', nome:'Presidente Castello Branco — SC',     nac:true  },
  // ── SANTA CATARINA — Sistema Próprio (sem integração nacional) ──────────────
  { ibge:'4216602', nome:'São José — SC',                       nac:false },
  { ibge:'4215802', nome:'São Bento do Sul — SC',               nac:false },
  { ibge:'4211900', nome:'Palhoça — SC',                        nac:false },
  // ── RIO GRANDE DO SUL ───────────────────────────────────────────────────────
  { ibge:'4314902', nome:'Porto Alegre — RS',    nac:true  },
  { ibge:'4305108', nome:'Caxias do Sul — RS',   nac:true  },
  { ibge:'4316907', nome:'Santa Maria — RS',     nac:true  },
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
// SC: mínimo legal 2% (LC 157/2016). Novas cidades adicionadas com 2% padrão.
export const ISS_IBGE = {
  '4209102': '2,00', // Joinville SC
  '4205407': '2,00', // Florianópolis SC
  '4202404': '2,00', // Blumenau SC
  '4208203': '2,00', // Itajaí SC
  '4204202': '2,00', // Chapecó SC
  '4204608': '2,00', // Criciúma SC
  '4208906': '2,00', // Jaraguá do Sul SC
  '4202909': '2,00', // Brusque SC
  '4202008': '2,00', // Balneário Camboriú SC
  '4218707': '2,00', // Tubarão SC
  '4204301': '2,00', // Concórdia SC
  '4208302': '2,00', // Itapema SC
  '4205902': '2,00', // Gaspar SC
  '4203006': '2,00', // Caçador SC
  '4207007': '2,00', // Içara SC
  '4207304': '2,00', // Imbituba SC
  '4219507': '2,00', // Xanxerê SC
  '4202107': '2,00', // Barra Velha SC
  '4206504': '2,00', // Guaramirim SC
  '4217204': '2,00', // São Miguel do Oeste SC
  '4209409': '2,00', // Laguna SC
  '4203600': '2,00', // Campos Novos SC
  '4213203': '2,00', // Pomerode SC
  '4202800': '2,00', // Braço do Norte SC
  '4216305': '2,00', // São João Batista SC
  '4205456': '2,00', // Forquilhinha SC
  '4219705': '2,00', // Xaxim SC
  '4213609': '2,00', // Porto União SC
  '4209003': '2,00', // Joaçaba SC
  '4217709': '2,00', // Sombrio SC
  '4210506': '2,00', // Maravilha SC
  '4215703': '2,00', // Santo Amaro da Imperatriz SC
  '4208500': '2,00', // Ituporanga SC
  '4202453': '2,00', // Bombinhas SC
  '4206306': '2,00', // Guabiruba SC
  '4216909': '2,00', // São Lourenço do Oeste SC
  '4203956': '2,00', // Capivari de Baixo SC
  '4211702': '2,00', // Orleans SC
  '4203907': '2,00', // Capinzal SC
  '4208104': '2,00', // Itaiópolis SC
  '4206702': '2,00', // Herval d'Oeste SC
  '4219002': '2,00', // Urussanga SC
  '4214003': '2,00', // Presidente Getúlio SC
  '4217402': '2,00', // Schroeder SC
  '4217501': '2,00', // Seara SC
  '4217808': '2,00', // Taió SC
  '4206009': '2,00', // Governador Celso Ramos SC
  '4204251': '2,00', // Cocal do Sul SC
  '4200101': '2,00', // Abelardo Luz SC
  '4202073': '2,00', // Balneário Gaivota SC
  '4220000': '2,00', // Balneário Rincão SC
  '4201950': '2,00', // Balneário Arroio do Silva SC
  '4208401': '2,00', // Itapiranga SC
  '4212106': '2,00', // Palmitos SC
  '4205001': '2,00', // Dionísio Cerqueira SC
  '4209607': '2,00', // Lauro Müller SC
  '4212254': '2,00', // Passo de Torres SC
  '4211504': '2,00', // Nova Trento SC
  '4217006': '2,00', // São Ludgero SC
  '4217600': '2,00', // Siderópolis SC
  '4211603': '2,00', // Nova Veneza SC
  '4215455': '2,00', // Sangão SC
  '4218806': '2,00', // Turvo SC
  '4203709': '2,00', // Canelinha SC
  '4215109': '2,00', // Rodeio SC
  '4206207': '2,00', // Gravatal SC
  '4207205': '2,00', // Imaruí SC
  '4210001': '2,00', // Luiz Alves SC
  '4209706': '2,00', // Lebon Régis SC
  '4200200': '2,00', // Agrolândia SC
  '4214201': '2,00', // Quilombo SC
  '4204707': '2,00', // Cunha Porã SC
  '4218905': '2,00', // Urubici SC
  '4206405': '2,00', // Guaraciaba SC
  '4204004': '2,00', // Catanduvas SC
  '4200705': '2,00', // Alfredo Wagner SC
  '4213401': '2,00', // Ponte Serrada SC
  '4204400': '2,00', // Coronel Freitas SC
  '4212650': '2,00', // Pescaria Brava SC
  '4207809': '2,00', // Irani SC
  '4216008': '2,00', // São Carlos SC
  '4207908': '2,00', // Irineópolis SC
  '4211009': '2,00', // Mondaí SC
  '4201257': '2,00', // Apiúna SC
  '4203501': '2,00', // Campo Erê SC
  '4207650': '2,00', // Iporã do Oeste SC
  '4212304': '2,00', // Paulo Lopes SC
  '4216107': '2,00', // São Domingos SC
  '4218509': '2,00', // Treze Tílias SC
  '4201505': '2,00', // Armazém SC
  '4216800': '2,00', // São José do Cerrito SC
  '4204905': '2,00', // Descanso SC
  '4201703': '2,00', // Ascurra SC
  '4209508': '2,00', // Laurentino SC
  '4210407': '2,00', // Maracajá SC
  '4217907': '2,00', // Tangará SC
  '4215679': '2,00', // Santa Terezinha SC
  '4207700': '2,00', // Ipumirim SC
  '4207684': '2,00', // Ipuaçu SC
  '4211108': '2,00', // Monte Castelo SC
  '4212007': '2,00', // Palma Sola SC
  '4218400': '2,00', // Treze de Maio SC
  '4218608': '2,00', // Trombudo Central SC
  '4218251': '2,00', // Timbó Grande SC
  '4203402': '2,00', // Campo Belo do Sul SC
  '4208005': '2,00', // Itá SC
  '4201901': '2,00', // Aurora SC
  '4210803': '2,00', // Meleiro SC
  '4200606': '2,00', // Águas Mornas SC
  '4212700': '2,00', // Petrolândia SC
  '4200408': '2,00', // Água Doce SC
  '4216255': '2,00', // São João do Oeste SC
  '4203105': '2,00', // Caibi SC
  '4206108': '2,00', // Grão-Pará SC
  '4200309': '2,00', // Agronômica SC
  '4216057': '2,00', // São Cristóvão do Sul SC
  '4214409': '2,00', // Rio das Antas SC
  '4209151': '2,00', // José Boiteux SC
  '4219200': '2,00', // Vidal Ramos SC
  '4207403': '2,00', // Imbuia SC
  '4200507': '2,00', // Águas de Chapecó SC
  '4217253': '2,00', // São Pedro de Alcântara SC
  '4200804': '2,00', // Anchieta SC
  '4210035': '2,00', // Luzerna SC
  '4202701': '2,00', // Botuverá SC
  '4219358': '2,00', // Vitor Meireles SC
  '4211405': '2,00', // Nova Erechim SC
  '4204350': '2,00', // Cordilheira Alta SC
  '4205209': '2,00', // Erval Velho SC
  '4218756': '2,00', // Tunápolis SC
  '4214904': '2,00', // Rio Fortuna SC
  '4206603': '2,00', // Guarujá do Sul SC
  '4215075': '2,00', // Riqueza SC
  '4215208': '2,00', // Romelândia SC
  '4204103': '2,00', // Caxambu do Sul SC
  '4211454': '2,00', // Nova Itaberaba SC
  '4207601': '2,00', // Ipira SC
  '4219176': '2,00', // Vargem Bonita SC
  '4209854': '2,00', // Lindóia do Sul SC
  '4201273': '2,00', // Arabutã SC
  '4215406': '2,00', // Salto Veloso SC
  '4208609': '2,00', // Jaborá SC
  '4202859': '2,00', // Braço do Trombudo SC
  '4210902': '2,00', // Modelo SC
  '4212270': '2,00', // Passos Maia SC
  '4202503': '2,00', // Bom Jardim da Serra SC
  '4207759': '2,00', // Iraceminha SC
  '4201109': '2,00', // Anitápolis SC
  '4215356': '2,00', // Saltinho SC
  '4201604': '2,00', // Arroio Trinta SC
  '4219606': '2,00', // Xavantina SC
  '4213005': '2,00', // Pinheiro Preto SC
  '4205175': '2,00', // Entre Rios SC
  '4203154': '2,00', // Calmon SC
  '4217105': '2,00', // São Martinho SC
  '4217550': '2,00', // Serra Alta SC
  '4204178': '2,00', // Cerro Negro SC
  '4206801': '2,00', // Ibicaré SC
  '4201802': '2,00', // Atalanta SC
  '4202081': '2,00', // Bandeirante SC
  '4205605': '2,00', // Galvão SC
  '4211256': '2,00', // Morro Grande SC
  '4214151': '2,00', // Princesa SC
  '4212601': '2,00', // Peritiba SC
  '4204194': '2,00', // Chapadão do Lageado SC
  '4200556': '2,00', // Águas Frias SC
  '4207577': '2,00', // Iomerê SC
  '4217758': '2,00', // Sul Brasil SC
  '4202537': '2,00', // Bom Jesus SC
  '4218855': '2,00', // União do Oeste SC
  '4218954': '2,00', // Urupema SC
  '4215752': '2,00', // São Bernardino SC
  '4202156': '2,00', // Belmonte SC
  '4209177': '2,00', // Jupiá SC
  '4211652': '2,00', // Novo Horizonte SC
  '4203253': '2,00', // Capão Alto SC
  '4212056': '2,00', // Palmeira SC
  '4200051': '2,00', // Abdon Batista SC
  '4219150': '2,00', // Vargem SC
  '4201653': '2,00', // Arvoredo SC
  '4215687': '2,00', // Santa Terezinha do Progresso SC
  '4217956': '2,00', // Tigrinhos SC
  '4215554': '2,00', // Santa Helena SC
  '4202875': '2,00', // Brunópolis SC
  '4215059': '2,00', // Rio Rufino SC
  '4214102': '2,00', // Presidente Nereu SC
  '4211892': '2,00', // Painel SC
  '4210555': '2,00', // Marema SC
  '4211850': '2,00', // Ouro Verde SC
  '4215604': '2,00', // Santa Rosa de Lima SC
  '4207858': '2,00', // Irati SC
  '4204459': '2,00', // Coronel Martins SC
  '4204756': '2,00', // Cunhataí SC
  '4211876': '2,00', // Paial SC
  '4205357': '2,00', // Flor do Sertão SC
  '4208955': '2,00', // Jardinópolis SC
  '4210050': '2,00', // Macieira SC
  '4217154': '2,00', // São Miguel da Boa Vista SC
  '4209458': '2,00', // Lajeado Grande SC
  '4215695': '2,00', // Santiago do Sul SC
  '4213906': '2,00', // Presidente Castello Branco SC
  '4216602': '2,00', // São José SC
  '4215802': '2,00', // São Bento do Sul SC
  '4211900': '2,00', // Palhoça SC
  '4314902': '3,00', // Porto Alegre RS
  '4305108': '2,00', // Caxias do Sul RS
  '4316907': '2,00', // Santa Maria RS
  '4314407': '2,00', // Pelotas RS
  '4309100': '5,00', // Gramado RS
  '4106902': '2,50', // Curitiba PR
  '4113700': '5,00', // Londrina PR
  '4115200': '5,00', // Maringá PR
  '4119905': '2,00', // Ponta Grossa PR
  '4104808': '2,00', // Cascavel PR
}
