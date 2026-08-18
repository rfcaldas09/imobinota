-- Reforma Tributária (IBS/CBS) — campos informativos
-- NBS: Nomenclatura Brasileira de Serviços
-- CST: Código de Situação Tributária (IBS/CBS)
-- cIndOp: Indicador de Operação
-- cClassTrib: Classificação Tributária (6 dígitos)
-- Obrigatório para Lucro Real/Presumido a partir de 03/08/2026
-- Obrigatório para Simples Nacional a partir de 01/01/2027

alter table profiles
  add column if not exists nfse_nbs        text,
  add column if not exists nfse_cst        text,
  add column if not exists nfse_cindop     text,
  add column if not exists nfse_cclasstrib text;
