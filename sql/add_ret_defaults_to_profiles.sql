-- Retenções federais padrão do prestador (por usuário)
-- NULL = não configurado → sistema usa padrão nacional
-- 0    = usuário zerou explicitamente (sem retenção)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ret_irrf   NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ret_csll   NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ret_cofins NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ret_pis    NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ret_inss   NUMERIC(5,2) DEFAULT NULL;

COMMENT ON COLUMN profiles.ret_irrf   IS 'Alíquota padrão IRRF (%). NULL = usa padrão nacional 1,5%.';
COMMENT ON COLUMN profiles.ret_csll   IS 'Alíquota padrão CSLL (%). NULL = usa padrão nacional 1%.';
COMMENT ON COLUMN profiles.ret_cofins IS 'Alíquota padrão COFINS (%). NULL = usa padrão nacional 3%.';
COMMENT ON COLUMN profiles.ret_pis    IS 'Alíquota padrão PIS (%). NULL = usa padrão nacional 0,65%.';
COMMENT ON COLUMN profiles.ret_inss   IS 'Alíquota padrão INSS (%). NULL = não retém por padrão.';
