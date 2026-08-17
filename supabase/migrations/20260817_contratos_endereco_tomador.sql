-- Adiciona campos de endereço do tomador à tabela contratos
-- Usados para preenchimento do <end> da NFS-e recorrente

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS toma_logradouro text,
  ADD COLUMN IF NOT EXISTS toma_numero     text,
  ADD COLUMN IF NOT EXISTS toma_bairro     text,
  ADD COLUMN IF NOT EXISTS toma_cep        text,
  ADD COLUMN IF NOT EXISTS toma_cod_mun    text,
  ADD COLUMN IF NOT EXISTS toma_mun_nome   text;
