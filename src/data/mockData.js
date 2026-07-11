// ── Dados mockados — espelho do demo ─────────────────────────────
export const MOCK_NAMES = [
  "Maria Aparecida Silva","João Carlos Santos","Ana Paula Rodrigues",
  "Carlos Eduardo Becker","Fernanda Oliveira Souza","Roberto Alves Pereira",
  "Luciana Martins Costa","Marcelo Schroeder","Patrícia Zimmermann",
  "Gustavo Henrique Müller","Simone Küster Ramos","Thiago Barreiros Lima",
  "Daniela Fonseca Krause","Eduardo Wittmann","Aline Bertoldi Nunes",
  "Ricardo Ternes","Camila Petri Lopes","Felipe Rauber Costa",
  "Juliana Seemann","André Schmitt Filho",
];

export const MOCK_PROPS = [
  "Ap. 201 — R. XV de Novembro, 450","Sala 12 — R. 7 de Setembro, 230",
  "Casa — R. Joinville, 88","Ap. 503 — R. Itajaí, 1.200",
  "Sala 8 — Av. Brasil, 950","Ap. 102 — R. Humberto de Campos, 300",
  "Casa — R. Visconde de Taunay, 55","Galpão — R. Industrial, 1.500",
  "Ap. 305 — R. Hermann Weege, 100","Sala 201 — R. Angelo Dias, 400",
  "Ap. 401 — Av. Pres. Castelo Branco, 200","Casa — R. Amazonas, 777",
  "Loja — R. Floriano Peixoto, 80","Ap. 601 — R. Bahia, 500",
  "Sala 15 — Ed. Empresarial, R. Dr. Blumenau, 999",
  "Ap. 102 — R. São Paulo, 320","Casa — R. 2 de Setembro, 150",
  "Galpão — Dist. Industrial, Quadra 5","Ap. 203 — R. Bahia, 180",
  "Sala 6 — R. Tiradentes, 400",
];

const VALUES    = [1600,1750,1850,1900,1950,2100,2200,2300,2400,2750,2850,2950,3200,3500,3800,4500,5100,6200,7800,1680];
const STATUSES  = ["Pago","Em Atraso","Pendente","Em Atraso","Pago","Pendente","Pendente","Pago","Pago","Em Atraso","Pendente","Pago","Em Atraso","Pendente","Pago","Pendente","Em Atraso","Pago","Pendente","Pago"];
const DUE_DAYS  = [5,10,1,15,20,10,25,1,8,12,5,18,3,28,7,22,14,1,16,9];
const SEG_FIN   = [180,0,220,0,150,0,200,0,120,0,300,0,180,250,0,160,0,0,200,0];
const SEG_INC   = [90,80,0,110,75,0,95,85,0,130,70,0,105,80,90,0,0,115,75,100];
const IPTS      = [280,320,0,450,350,0,500,280,420,0,380,310,0,420,290,480,360,0,310,400];
const END_DATES = [
  "2026-07-31","2026-12-31","2026-08-31","2027-06-30","2026-12-31",
  "2026-09-30","2026-12-31","2027-12-31","2026-12-31","2026-08-15",
  "2026-12-31","2026-12-31","2026-09-15","2027-06-30","2026-12-31",
  "2026-07-31","2026-12-31","2027-12-31","2026-12-31","2026-08-31",
];

export const CONTRACTS = MOCK_NAMES.map((name, i) => ({
  id: i + 1,
  tenant: name,
  cpf: `${String(321+i*37).slice(0,3)}.${String(654+i*19).slice(0,3)}.${String(987+i*11).slice(0,3)}-${String(11+i*7).slice(0,2)}`,
  property: MOCK_PROPS[i],
  value: VALUES[i],
  seguroFinanceiro: SEG_FIN[i],
  seguroIncendio: SEG_INC[i],
  iptu: IPTS[i],
  totalValue: VALUES[i] + SEG_FIN[i] + SEG_INC[i] + IPTS[i],
  dueDay: DUE_DAYS[i],
  email: name.split(' ')[0].toLowerCase().replace(/[^a-z]/g,'') + "@email.com",
  phone: `(47) 9${9100+i*37}-${4500+i*29}`,
  start: "2023-01-01",
  end: END_DATES[i],
  status: STATUSES[i],
}));

export const KPI = {
  total: 600, paid: 245, pending: 267, overdue: 88,
  paidVal: 441800, pendingVal: 482100, overdueVal: 157500,
  get totalVal() { return this.paidVal + this.pendingVal + this.overdueVal; },
};

export const MONTHS_DATA = [
  { label:'Agosto/2025',    short:'Ago/25', key:'2025-08', mon:8,  yr:2025, paidVal:1018400, pendingVal:0,      overdueVal:63200,  paid:476, pending:0,   overdue:24 },
  { label:'Setembro/2025',  short:'Set/25', key:'2025-09', mon:9,  yr:2025, paidVal:1035700, pendingVal:0,      overdueVal:45900,  paid:484, pending:0,   overdue:16 },
  { label:'Outubro/2025',   short:'Out/25', key:'2025-10', mon:10, yr:2025, paidVal:998300,  pendingVal:0,      overdueVal:83300,  paid:466, pending:0,   overdue:34 },
  { label:'Novembro/2025',  short:'Nov/25', key:'2025-11', mon:11, yr:2025, paidVal:1048200, pendingVal:0,      overdueVal:33400,  paid:490, pending:0,   overdue:10 },
  { label:'Dezembro/2025',  short:'Dez/25', key:'2025-12', mon:12, yr:2025, paidVal:1022600, pendingVal:0,      overdueVal:59000,  paid:478, pending:0,   overdue:22 },
  { label:'Janeiro/2026',   short:'Jan/26', key:'2026-01', mon:1,  yr:2026, paidVal:1031200, pendingVal:0,      overdueVal:50400,  paid:482, pending:0,   overdue:18 },
  { label:'Fevereiro/2026', short:'Fev/26', key:'2026-02', mon:2,  yr:2026, paidVal:1008800, pendingVal:0,      overdueVal:72800,  paid:471, pending:0,   overdue:29 },
  { label:'Março/2026',     short:'Mar/26', key:'2026-03', mon:3,  yr:2026, paidVal:1054300, pendingVal:0,      overdueVal:27300,  paid:492, pending:0,   overdue:8  },
  { label:'Abril/2026',     short:'Abr/26', key:'2026-04', mon:4,  yr:2026, paidVal:986700,  pendingVal:0,      overdueVal:95000,  paid:461, pending:0,   overdue:39 },
  { label:'Maio/2026',      short:'Mai/26', key:'2026-05', mon:5,  yr:2026, paidVal:1071400, pendingVal:0,      overdueVal:10200,  paid:501, pending:0,   overdue:4  },
  { label:'Junho/2026',     short:'Jun/26', key:'2026-06', mon:6,  yr:2026, paidVal:1048900, pendingVal:0,      overdueVal:32700,  paid:490, pending:0,   overdue:10 },
  { label:'Julho/2026',     short:'Jul/26', key:'2026-07', mon:7,  yr:2026, paidVal:441800,  pendingVal:482100, overdueVal:157500, paid:245, pending:267, overdue:88 },
];

export const SEND_LOGS = [
  { id:1, date:"02/06/2026 08:14", total:600, success:596, failed:4 },
  { id:2, date:"02/05/2026 08:22", total:598, success:598, failed:0 },
  { id:3, date:"01/04/2026 09:05", total:595, success:591, failed:4 },
];

export const fmt     = v => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
export const fmtN    = v => v.toLocaleString('pt-BR');
export const fmtDate = d => new Date(d).toLocaleDateString('pt-BR');
