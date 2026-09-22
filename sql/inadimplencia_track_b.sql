-- ════════════════════════════════════════════════════════════════════
-- TRACK B — Criar inquilinos + contratos (stub) + cobranças
-- Cliente  : caue@imoveisportal.com
-- user_id  : 4454dc69-8734-4489-a518-ed4259f02903
-- Total    : 107 cobranças → 31 Locações novas
-- Execute no Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════════
--
-- Status mapeado:
--   "Em Aberto" → status = 'Em Atraso', situacao_cobranca = 'Cobrar'
--   "Parcial"   → status = 'Pendente',  situacao_cobranca = 'Pagou parcial'
--
-- mes_referencia: formato 'YYYY-MM-01' (date com dia fixo em 1)
-- data_vencimento: formato 'YYYY-MM-DD'
--
-- ATENÇÃO — mes_referencia duplicado (parcelas):
--   Locação 5972 (Luciana): 2x '2025-06-01'
--   Locação 6922 (Eliezer): 4x '2025-07-01'
--   Se existir unique constraint em (contrato_id, mes_referencia), remova-o antes.
-- ════════════════════════════════════════════════════════════════════

-- Remove constraint para permitir parcelas com mesmo mes_referencia (ex: 6922 Eliezer)
-- Re-adicionar depois se necessário: ALTER TABLE cobrancas ADD CONSTRAINT cobrancas_contrato_mes_uq UNIQUE (contrato_id, mes_referencia);
ALTER TABLE cobrancas DROP CONSTRAINT IF EXISTS cobrancas_contrato_mes_uq;

DO $$
DECLARE
  _uid uuid := '4454dc69-8734-4489-a518-ed4259f02903';
  _i   uuid;
  _c   uuid;
BEGIN

  -- ── 133 | Fabio Lenoir (6 cobranças) ─────────────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Fabio Lenoir') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'133', _i, '(stub) Locação 133', 0, 0, 0, 0, 10, '2025-10-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-10-01','2025-11-10',10,2665.01,0,0,0,2665.01,3205.63,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,2676.88,0,0,0,2676.88,3191.99,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10,2616.57,0,0,0,2616.57,3093.12,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-02-10',10,2672.74,0,0,0,2672.74,3132.25,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-03-10',10,2123.26,0,0,0,2123.26,2469.07,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-03-12',12,913.78,0,0,0,913.78,1060.96,'Em Atraso','Cobrar');

  -- ── 3871 | Francine Martins Mauricio (2 cobranças) ────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Francine Martins Mauricio') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'3871', _i, '(stub) Locação 3871', 0, 0, 0, 0, 10, '2026-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-06-01','2026-07-15',15,245.00,0,0,0,245.00,274.38,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-07-01','2026-08-15',15,245.00,0,0,0,245.00,271.90,'Em Atraso','Cobrar');

  -- ── 5821 | Willamis da Rocha Lucena (4 cobranças) ─────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Willamis da Rocha Lucena') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'5821', _i, '(stub) Locação 5821', 0, 0, 0, 0, 10, '2026-03-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-03-01','2026-04-10',10,1591.97,0,0,0,1591.97,1834.38,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-04-01','2026-05-10',10,1591.97,0,0,0,1591.97,1818.48,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-05-01','2026-06-10',10,1859.76,0,0,0,1859.76,2105.26,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-06-01','2026-07-03', 3,2721.40,0,0,0,2721.40,3059.97,'Em Atraso','Cobrar');

  -- ── 5947 | Daiane Correa (6 cobranças) ───────────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Daiane Correa') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'5947', _i, '(stub) Locação 5947', 0, 0, 0, 0, 10, '2025-08-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,1647.44,0,0,0,1647.44,2015.13,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-11-10',10, 457.38,0,0,0, 457.38, 549.32,'Pendente','Pagou parcial'),
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,1625.63,0,0,0,1625.63,1938.31,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10,1625.63,0,0,0,1625.63,1921.57,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-02-10',10,1654.12,0,0,0,1654.12,1938.33,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-02-18',18,1873.06,0,0,0,1873.06,2189.33,'Em Atraso','Cobrar');

  -- ── 5972 | Luciana Correa dos Santos (2 parcelas da competência 6/2025)
  -- mes_referencia usa o mês do vencimento de cada parcela para evitar duplicata
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Luciana Correa dos Santos') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'5972', _i, '(stub) Locação 5972', 0, 0, 0, 0, 10, '2026-01-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-01-01','2026-01-10',10,1500.00,0,0,0,1500.00,1773.50,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-02-10',10,1997.82,0,0,0,1997.82,2342.32,'Em Atraso','Cobrar');

  -- ── 5982 | Gunnar Spiess Jankauskas (2 cobranças) ─────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Gunnar Spiess Jankauskas') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'5982', _i, '(stub) Locação 5982', 0, 0, 0, 0, 10, '2025-09-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-09-01','2025-10-10',10,1724.42,0,0,0,1724.42,2090.09,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-11-26',26,1316.74,0,0,0,1316.74,1576.89,'Em Atraso','Cobrar');

  -- ── 6045 | Jolie Lemos (2 cobranças) ─────────────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Jolie Lemos') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6045', _i, '(stub) Locação 6045', 0, 0, 0, 0, 10, '2026-05-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-05-01','2026-06-10',10,4285.50,0,0,0,4285.50,4851.33,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-06-01','2026-07-10',10,3716.80,0,0,0,3716.80,4170.32,'Em Atraso','Cobrar');

  -- ── 6060 | Arnelys Saray Rivas Duquez (3 cobranças) ──────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Arnelys Saray Rivas Duquez') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6060', _i, '(stub) Locação 6060', 0, 0, 0, 0, 10, '2025-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-06-01','2025-07-10',10,1782.64,0,0,0,1782.64,2215.19,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,1796.69,0,0,0,1796.69,2216.36,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-08-20',20,2156.78,0,0,0,2156.78,2653.26,'Em Atraso','Cobrar');

  -- ── 6079 | Jairo Sousa da Silva (1 cobrança) ─────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Jairo Sousa da Silva') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6079', _i, '(stub) Locação 6079', 0, 0, 0, 0, 10, '2026-02-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-02-01','2026-03-13',13,3727.13,0,0,0,3727.13,4329.24,'Em Atraso','Cobrar');

  -- ── 6166 | Janaina Luz da Silva (1 cobrança) ─────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Janaina Luz da Silva') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6166', _i, '(stub) Locação 6166', 0, 0, 0, 0, 10, '2026-04-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-04-01','2026-05-12',12,9963.75,0,0,0,9963.75,11375.13,'Em Atraso','Cobrar');

  -- ── 6280 | Keli Fernanda Perotto (3 cobranças) ───────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Keli Fernanda Perotto') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6280', _i, '(stub) Locação 6280', 0, 0, 0, 0, 10, '2025-10-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-10-01','2025-11-15',15,4196.66,0,0,0,4196.66,5040.53,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-12-15',15,4051.98,0,0,0,4051.98,4825.73,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10,4307.39,0,0,0,4307.39,5093.81,'Em Atraso','Cobrar');

  -- ── 6285 | Jéssica Leonida Padilha Bosio (13 cobranças) ──────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Jéssica Leonida Padilha Bosio') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6285', _i, '(stub) Locação 6285', 0, 0, 0, 0, 10, '2025-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-06-01','2025-07-10',10,4697.46,0,0,0,4697.46,5843.88,'Pendente','Pagou parcial'),
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,4490.13,0,0,0,4490.13,5539.14,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,4433.42,0,0,0,4433.42,5422.88,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-09-10',10,6291.80,0,0,0,6291.80,7695.88,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-10-25',25,1600.00,0,0,0,1600.00,1931.72,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-11-25',25,1600.00,0,0,0,1600.00,1915.29,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2025-12-25',25,1600.00,0,0,0,1600.00,1899.39,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-01-25',25,1600.00,0,0,0,1600.00,1882.96,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-02-25',25,1600.00,0,0,0,1600.00,1866.53,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-03-25',25,1600.00,0,0,0,1600.00,1851.69,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-04-01','2026-04-25',25,1600.00,0,0,0,1600.00,1835.26,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-05-01','2026-05-25',25,1600.00,0,0,0,1600.00,1819.36,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-06-01','2026-06-25',25,1600.00,0,0,0,1600.00,1802.93,'Em Atraso','Cobrar');

  -- ── 6333 | Vinicius Nicolau bobadilha (4 cobranças) ──────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Vinicius Nicolau bobadilha') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6333', _i, '(stub) Locação 6333', 0, 0, 0, 0, 10, '2025-07-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,1681.79,0,0,0,1681.79,2073.97,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,1682.89,0,0,0,1682.89,2057.82,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-10-10',10,1724.40,0,0,0,1724.40,2090.07,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-11-12',12,4725.31,0,0,0,4725.31,5681.32,'Em Atraso','Cobrar');

  -- ── 6336 | Tatiana Cristina Rodrigues Evaristo (3 cobranças) ─────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Tatiana Cristina Rodrigues Evaristo') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6336', _i, '(stub) Locação 6336', 0, 0, 0, 0, 10, '2025-07-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,2543.11,0,0,0,2543.11,3137.42,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,2579.78,0,0,0,2579.78,3155.10,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-09-11',11,6034.52,0,0,0,6034.52,7377.65,'Em Atraso','Cobrar');

  -- ── 6566 | Kewin Guimarães Machado (1 cobrança) ──────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Kewin Guimarães Machado') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6566', _i, '(stub) Locação 6566', 0, 0, 0, 0, 10, '2026-04-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-04-01','2026-06-16',16,2926.06,0,0,0,2926.06,3306.87,'Pendente','Pagou parcial');

  -- ── 6613 | Carlos Eduardo de Souza (4 cobranças) ─────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Carlos Eduardo de Souza') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6613', _i, '(stub) Locação 6613', 0, 0, 0, 0, 10, '2025-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-06-01','2025-07-10',10,1074.13,0,0,0,1074.13,1336.70,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,1448.22,0,0,0,1448.22,1785.04,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,1448.22,0,0,0,1448.22,1770.16,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-09-17',17,5664.28,0,0,0,5664.28,6914.89,'Em Atraso','Cobrar');

  -- ── 6656 | Douglas Henrique Soster Vitorio (3 cobranças) ─────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Douglas Henrique Soster Vitorio') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6656', _i, '(stub) Locação 6656', 0, 0, 0, 0, 10, '2025-10-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-10-01','2025-11-10',10,1329.38,0,0,0,1329.38,1597.84,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,1355.77,0,0,0,1355.77,1616.45,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2025-12-08', 8, 859.53,0,0,0, 859.53,1026.68,'Em Atraso','Cobrar');

  -- ── 6771 | Marcos Jose Vilela Geremias Fernandez (3 cobranças) ────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Marcos Jose Vilela Geremias Fernandez') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6771', _i, '(stub) Locação 6771', 0, 0, 0, 0, 10, '2025-11-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,2634.04,0,0,0,2634.04,3142.08,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10,2651.05,0,0,0,2651.05,3133.52,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-01-29',29,8688.52,0,0,0,8688.52,10218.57,'Em Atraso','Cobrar');

  -- ── 6776 | Paulo César Coelho Santos (3 cobranças) ────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Paulo César Coelho Santos') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6776', _i, '(stub) Locação 6776', 0, 0, 0, 0, 10, '2026-01-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-01-01','2026-02-10',10,1230.71,0,0,0,1230.71,1442.34,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-03-10',10,1230.71,0,0,0,1230.71,1430.86,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-04-14',14, 528.19,0,0,0, 528.19, 608.55,'Em Atraso','Cobrar');

  -- ── 6808 | Vinicius Guilherme Vicente Alves (4 cobranças) ─────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Vinicius Guilherme Vicente Alves') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6808', _i, '(stub) Locação 6808', 0, 0, 0, 0, 10, '2025-12-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-12-01','2026-01-10',10, 7646.81,0,0,0, 7646.81, 9041.34,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-02-10',10, 7751.97,0,0,0, 7751.97, 9084.45,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-03-10',10, 7751.97,0,0,0, 7751.97, 9012.21,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-04-10',10,12448.16,0,0,0,12448.16,14344.53,'Em Atraso','Cobrar');

  -- ── 6829 | Luiz Fernando Nascimento Rodrigues (6 cobranças) ──────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Luiz Fernando Nascimento Rodrigues') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6829', _i, '(stub) Locação 6829', 0, 0, 0, 0, 10, '2026-01-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-01-01','2026-02-10',10, 2072.98,0,0,0, 2072.98, 2429.32,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-03-10',10, 2010.88,0,0,0, 2010.88, 2337.93,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-04-10',10, 1854.29,0,0,0, 1854.29, 2137.06,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-04-01','2026-05-10',10, 2226.98,0,0,0, 2226.98, 2543.66,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-05-01','2026-06-10',10, 2145.08,0,0,0, 2145.08, 2428.71,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-06-01','2026-07-03', 3,13295.18,0,0,0,13295.18,14948.09,'Em Atraso','Cobrar');

  -- ── 6855 | Magna Marivone Ferreira (6 cobranças) ─────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Magna Marivone Ferreira') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6855', _i, '(stub) Locação 6855', 0, 0, 0, 0, 10, '2025-07-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,1369.86,0,0,0,1369.86,1690.85,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,1369.86,0,0,0,1369.86,1676.59,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-10-10',10,1369.86,0,0,0,1369.86,1662.79,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-11-10',10,1369.86,0,0,0,1369.86,1648.53,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,1369.86,0,0,0,1369.86,1634.73,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10, 603.50,0,0,0, 603.50, 713.25,'Em Atraso','Cobrar');

  -- ── 6900 | Simone Said Fernandes Mubarak (1 cobrança) ─────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Simone Said Fernandes Mubarak') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6900', _i, '(stub) Locação 6900', 0, 0, 0, 0, 10, '2025-10-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-10-01','2025-11-27',27,6003.59,0,0,0,6003.59,7185.95,'Em Atraso','Cobrar');

  -- ── 6901 | Alef Lino Cavalcante (1 cobrança) ─────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Alef Lino Cavalcante') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6901', _i, '(stub) Locação 6901', 0, 0, 0, 0, 10, '2025-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-06-01','2025-07-10',10,1224.60,0,0,0,1224.60,1523.77,'Pendente','Pagou parcial');

  -- ── 6922 | Eliezer Sutil (10 cobranças — mes_ref '2025-07-01' duplicado 4x/parcelas)
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Eliezer Sutil') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6922', _i, '(stub) Locação 6922', 0, 0, 0, 0, 10, '2025-07-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-07-01','2025-10-10',10,  845.14,0,0,0,  845.14, 1024.57,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2025-11-10',10,  845.14,0,0,0,  845.14, 1015.89,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2025-12-10',10,  845.14,0,0,0,  845.14, 1007.49,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2026-01-10',10,  845.14,0,0,0,  845.14,  998.81,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10, 1914.36,0,0,0, 1914.36, 2341.96,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-10-10',10, 1914.36,0,0,0, 1914.36, 2322.76,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-10-01','2025-11-10',10, 1914.36,0,0,0, 1914.36, 2302.92,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-11-01','2025-12-10',10, 1914.36,0,0,0, 1914.36, 2283.72,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-12-01','2026-01-10',10, 1914.36,0,0,0, 1914.36, 2263.88,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-01-01','2026-01-14',14,14046.80,0,0,0,14046.80,16588.72,'Em Atraso','Cobrar');

  -- ── 6944 | Alexia Eleonora Machado (1 cobrança) ──────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Alexia Eleonora Machado') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6944', _i, '(stub) Locação 6944', 0, 0, 0, 0, 10, '2026-03-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-03-01','2026-04-10',10,1271.22,0,0,0,1271.22,1464.28,'Em Atraso','Cobrar');

  -- ── 6947 | Andresa Tabata Andrade (1 cobrança) ───────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Andresa Tabata Andrade') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6947', _i, '(stub) Locação 6947', 0, 0, 0, 0, 10, '2025-11-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-11-01','2025-12-10',10,1693.64,0,0,0,1693.64,2018.68,'Pendente','Pagou parcial');

  -- ── 6979 | Gabriel Cidral (4 cobranças) ──────────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Gabriel Cidral') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'6979', _i, '(stub) Locação 6979', 0, 0, 0, 0, 10, '2025-06-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-06-01','2025-07-10',10,2162.90,0,0,0,2162.90, 2689.51,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,2162.90,0,0,0,2162.90, 2667.19,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-08-01','2025-09-10',10,2162.90,0,0,0,2162.90, 2644.87,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-09-16',16,8942.24,0,0,0,8942.24,10918.20,'Em Atraso','Cobrar');

  -- ── 7009 | Aline Davi Celestino — CONTRATO 1 (1 cobrança) ────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Aline Davi Celestino') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'7009', _i, '(stub) Locação 7009', 0, 0, 0, 0, 10, '2025-07-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-07-01','2025-08-10',10,918.88,0,0,0,918.88,1134.77,'Em Atraso','Cobrar');

  -- ── 7313 | Jean Carlos Baron (4 cobranças) ───────────────────────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Jean Carlos Baron') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'7313', _i, '(stub) Locação 7313', 0, 0, 0, 0, 10, '2026-01-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2026-01-01','2026-02-10',10,5948.44,0,0,0,5948.44,6970.96,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-02-01','2026-03-10',10,5948.44,0,0,0,5948.44,6915.52,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-03-01','2026-04-10',10,5970.04,0,0,0,5970.04,6879.47,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2026-04-01','2026-04-23',23,8463.69,0,0,0,8463.69,9716.14,'Em Atraso','Cobrar');

  -- ── 7669 | Aline Davi Celestino — CONTRATO 2 (2 cobranças) ──────────
  INSERT INTO inquilinos (user_id, nome) VALUES (_uid, 'Aline Davi Celestino') RETURNING id INTO _i;
  INSERT INTO contratos (user_id, num_contrato, inquilino_id, imovel, valor_aluguel, seguro_financeiro, seguro_incendio, iptu, dia_vencimento, data_inicio) VALUES (_uid,'7669', _i, '(stub) Locação 7669', 0, 0, 0, 0, 10, '2025-08-01') RETURNING id INTO _c;
  INSERT INTO cobrancas (user_id,contrato_id,inquilino_id,mes_referencia,data_vencimento,dia_vencimento,valor_aluguel,seguro_financeiro,seguro_incendio,iptu,valor_total,valor_atualizado,status,situacao_cobranca) VALUES
    (_uid,_c,_i,'2025-08-01','2025-09-10',10, 918.88,0,0,0, 918.88,1125.16,'Em Atraso','Cobrar'),
    (_uid,_c,_i,'2025-09-01','2025-09-17',17,4044.50,0,0,0,4044.50,4937.65,'Em Atraso','Cobrar');

END $$;

-- ════════════════════════════════════════════════════════════════════
-- Verificação pós-execução
-- ════════════════════════════════════════════════════════════════════
SELECT
  c.num_contrato,
  i.nome          AS inquilino,
  cb.mes_referencia,
  cb.data_vencimento,
  cb.valor_total,
  cb.valor_atualizado,
  cb.status,
  cb.situacao_cobranca
FROM cobrancas cb
JOIN contratos  c ON c.id = cb.contrato_id
JOIN inquilinos i ON i.id = cb.inquilino_id
WHERE cb.user_id = '4454dc69-8734-4489-a518-ed4259f02903'
  AND c.num_contrato IN (
    '133','3871','5821','5947','5972','5982','6045','6060','6079',
    '6166','6280','6285','6333','6336','6566','6613','6656','6771',
    '6776','6808','6829','6855','6900','6901','6922','6944','6947',
    '6979','7009','7313','7669'
  )
ORDER BY c.num_contrato::integer, cb.mes_referencia, cb.data_vencimento;
