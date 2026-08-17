-- Armazena o cobData original enviado ao nfse-emitir.
-- Permite reprocessar notas que falharam sem precisar redigitar os dados.

ALTER TABLE nfse_emissoes
  ADD COLUMN IF NOT EXISTS cob_data_json JSONB DEFAULT NULL;

COMMENT ON COLUMN nfse_emissoes.cob_data_json IS 'cobData original enviado ao nfse-emitir (usado para reprocessar erros).';
