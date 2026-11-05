-- Adiciona coluna vencimento_boleto na tabela nfse_emissoes
-- Usada para persistir a data de vencimento escolhida pelo usuário ao gerar CNAB/boleto
ALTER TABLE public.nfse_emissoes
  ADD COLUMN IF NOT EXISTS vencimento_boleto DATE;

COMMENT ON COLUMN public.nfse_emissoes.vencimento_boleto IS
  'Data de vencimento do boleto informada pelo usuário no momento da geração do arquivo CNAB.';
