-- Migração: alíquotas PIS/COFINS próprias do prestador + chave PIX de recebimento
-- Necessário para cálculo correto da base IBS/CBS (LC 214/2025)
-- PIS Próprio: 0,65% | COFINS Próprio: 3,00% (Lucro Presumido)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS aliquota_pis_proprio    numeric(6,4) DEFAULT 0.65,
  ADD COLUMN IF NOT EXISTS aliquota_cofins_proprio numeric(6,4) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS pix_key_recebimento     text;

COMMENT ON COLUMN profiles.aliquota_pis_proprio    IS 'Alíquota PIS do próprio prestador (regime tributário). Lucro Presumido: 0,65%. Usada para deduzir a base IBS/CBS.';
COMMENT ON COLUMN profiles.aliquota_cofins_proprio IS 'Alíquota COFINS do próprio prestador (regime tributário). Lucro Presumido: 3,00%. Usada para deduzir a base IBS/CBS.';
COMMENT ON COLUMN profiles.pix_key_recebimento     IS 'Chave PIX do beneficiário para geração de cobranças via OpenPix.';
