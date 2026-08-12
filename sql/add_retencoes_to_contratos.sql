-- Adiciona campos de retenção de impostos na tabela contratos
-- ISS retido pelo tomador + retenções federais (IRRF, CSLL, COFINS, PIS, INSS)

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS iss_retido   BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pct_irrf     NUMERIC(5,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pct_csll     NUMERIC(5,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pct_cofins   NUMERIC(5,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pct_pis      NUMERIC(5,2)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pct_inss     NUMERIC(5,2)   DEFAULT NULL;
