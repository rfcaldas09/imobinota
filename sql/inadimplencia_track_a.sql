-- ════════════════════════════════════════════════════════════════════
-- TRACK A — Cobranças para contratos JÁ EXISTENTES
-- Cliente  : caue@imoveisportal.com
-- user_id  : 4454dc69-8734-4489-a518-ed4259f02903
-- Total    : 24 cobranças → 14 contratos
-- Execute no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════
--
-- Status mapeado da planilha:
--   "Em Aberto"  → status = 'Em Atraso', situacao_cobranca = 'Cobrar'
--   "Parcial"    → status = 'Pendente',  situacao_cobranca = 'Pagou parcial'
--
-- Datas da coluna "Vencimento" convertidas de DD/MM/AAAA para AAAA-MM-DD

INSERT INTO cobrancas (
  user_id,
  contrato_id,
  inquilino_id,
  mes_referencia,
  data_vencimento,
  dia_vencimento,
  valor_aluguel,
  seguro_financeiro,
  seguro_incendio,
  iptu,
  valor_total,
  valor_atualizado,
  status,
  situacao_cobranca
)
SELECT
  '4454dc69-8734-4489-a518-ed4259f02903'::uuid  AS user_id,
  v.contrato_id,
  c.inquilino_id,
  (v.mes_referencia || '-01')::date AS mes_referencia,
  v.data_vencimento::date,
  v.dia_vencimento,
  v.valor_original   AS valor_aluguel,
  0                  AS seguro_financeiro,
  0                  AS seguro_incendio,
  0                  AS iptu,
  v.valor_original   AS valor_total,
  v.valor_atualizado,
  v.status,
  v.situacao_cobranca
FROM (VALUES
  -- ── num_contrato 1340 | Cleber Luciano Melim ──────────────────────
  ('f624e4cd-b08b-47f0-abbb-a29d3e5af8a5'::uuid, '2026-08', '2026-09-07', 7,  1892.59, 2086.26, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 5081 | Erika dos Santos Casemiro da Rocha ─────────
  ('88d0ea8d-ee86-4a9f-bb5c-91e0292b2eb2'::uuid, '2026-07', '2026-07-24', 24, 3699.52, 4133.43, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 5750 | Andrei de Tomas Subtil (Parcial) ───────────
  ('7527636c-5679-4241-9c5b-b61805d69630'::uuid, '2025-12', '2026-01-10', 10, 1928.16, 2279.06, 'Pendente',  'Pagou parcial'),

  -- ── num_contrato 5935 | Raquel Dos Passos ──────────────────────────
  ('282b1e89-1db8-4a6a-ac12-98f4f3ab0d1d'::uuid, '2026-07', '2026-08-10', 10, 2794.50, 3106.50, 'Em Atraso', 'Cobrar'),
  ('282b1e89-1db8-4a6a-ac12-98f4f3ab0d1d'::uuid, '2026-08', '2026-09-10', 10, 2794.50, 3077.67, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6321 | Tania de Fatima da Silva Rodrigues ─────────
  ('e96cab26-1a3e-4509-a4f2-af21f7587b2f'::uuid, '2026-08', '2026-09-10', 10, 4436.55, 4886.13, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6410 | Jean Carlo Machado Colmann ─────────────────
  ('735339ac-def0-4fe0-a79f-ac0b33b4b6aa'::uuid, '2026-05', '2026-06-10', 10, 2740.60, 3102.02, 'Em Atraso', 'Cobrar'),
  ('735339ac-def0-4fe0-a79f-ac0b33b4b6aa'::uuid, '2026-07', '2026-08-10', 10, 2696.40, 2997.54, 'Em Atraso', 'Cobrar'),
  ('735339ac-def0-4fe0-a79f-ac0b33b4b6aa'::uuid, '2026-08', '2026-09-10', 10, 2696.40, 2969.64, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6430 | Priscila Constante ─────────────────────────
  ('5f4f5198-8188-4dd7-b61e-ae991b15acf2'::uuid, '2026-08', '2026-09-10', 10, 1322.99, 1457.05, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6441 | Eco Express Serviços Sustentáveis Ltda ME ──
  ('c1d4317e-c24b-43c8-a724-4cd56f8db4fb'::uuid, '2026-08', '2026-09-10', 10, 8402.45, 9253.90, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6479 | Jaqueline Cristina dos Santos Grande ───────
  ('0222e224-3fe0-44ab-a3eb-22d98a9f1741'::uuid, '2026-07', '2026-08-10', 10, 3956.19, 4398.01, 'Em Atraso', 'Cobrar'),
  ('0222e224-3fe0-44ab-a3eb-22d98a9f1741'::uuid, '2026-08', '2026-09-10', 10, 3956.19, 4357.09, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6728 | Andressa Andriele Bueno Ramos ──────────────
  ('9f4d8f3d-0c72-4e94-903b-b1e8cef849ef'::uuid, '2026-07', '2026-08-10', 10, 1591.09, 1768.75, 'Em Atraso', 'Cobrar'),
  ('9f4d8f3d-0c72-4e94-903b-b1e8cef849ef'::uuid, '2026-08', '2026-09-10', 10, 1591.09, 1752.32, 'Em Atraso', 'Cobrar'),
  ('9f4d8f3d-0c72-4e94-903b-b1e8cef849ef'::uuid, '2026-09', '2026-09-12', 12, 8266.58, 9098.76, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6801 | Flavio Alexandre Faria ─────────────────────
  ('a0274093-372e-4ca5-b412-b8e9906edb13'::uuid, '2026-08', '2026-09-10', 10, 3612.75, 3978.83, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 6839 | Larissa Suzanne da Silva Costa ─────────────
  ('7c20c197-f30e-4f20-8f50-f989f99eada8'::uuid, '2026-05', '2026-06-10', 10, 1587.61, 1797.25, 'Em Atraso', 'Cobrar'),
  ('7c20c197-f30e-4f20-8f50-f989f99eada8'::uuid, '2026-06', '2026-07-10', 10, 1510.25, 1694.28, 'Em Atraso', 'Cobrar'),
  ('7c20c197-f30e-4f20-8f50-f989f99eada8'::uuid, '2026-07', '2026-07-10', 10, 3252.46, 3648.99, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 7003 | Barbara Marcolina Werner da Rocha ──────────
  ('2ae4e4c4-2ad8-4b7a-aba3-744ad1a84246'::uuid, '2026-08', '2026-09-10', 10, 1519.17, 1673.13, 'Em Atraso', 'Cobrar'),

  -- ── num_contrato 7470 | Emanuel Danecke Zanotto ─────────────────────
  ('d0252b69-0288-4885-98c3-7fc616f3cf04'::uuid, '2026-06', '2026-07-10', 10, 2092.66, 2348.13, 'Em Atraso', 'Cobrar'),
  ('d0252b69-0288-4885-98c3-7fc616f3cf04'::uuid, '2026-07', '2026-08-10', 10, 2092.66, 2326.43, 'Em Atraso', 'Cobrar'),
  ('d0252b69-0288-4885-98c3-7fc616f3cf04'::uuid, '2026-08', '2026-09-10', 10, 2092.66, 2304.73, 'Em Atraso', 'Cobrar')

) AS v(contrato_id, mes_referencia, data_vencimento, dia_vencimento,
       valor_original, valor_atualizado, status, situacao_cobranca)
JOIN contratos c ON c.id = v.contrato_id
ON CONFLICT (contrato_id, mes_referencia) DO NOTHING;

-- Verificar o que foi inserido:
SELECT
  c.num_contrato,
  i.nome AS inquilino,
  cb.mes_referencia,
  cb.valor_total,
  cb.valor_atualizado,
  cb.status,
  cb.situacao_cobranca
FROM cobrancas cb
JOIN contratos c  ON c.id  = cb.contrato_id
JOIN inquilinos i ON i.id  = cb.inquilino_id
WHERE cb.user_id = '4454dc69-8734-4489-a518-ed4259f02903'
  AND c.num_contrato IN (
    '1340','5081','5750','5935','6321','6410','6430','6441',
    '6479','6728','6801','6839','7003','7470'
  )
ORDER BY c.num_contrato::integer, cb.mes_referencia;
