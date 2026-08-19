-- Módulo Contabilidade — V1
-- Habilita modo contabilidade por usuário (flag setada pelo admin via banco)
-- Quando true: Contratos vira "Proprietários", cada contrato tem seu próprio A1, campos de imóvel ficam visíveis

-- 1. Flag de modo contabilidade no perfil
alter table profiles
  add column if not exists is_contabilidade boolean not null default false;

-- 2. Certificado A1 por contrato (proprietário)
--    Armazenados criptografados — a senha será criptografada igual ao profiles.nfse_cert_password_enc
alter table contratos
  add column if not exists cert_pfx_path    text,     -- caminho no Storage (bucket certificados-nfse)
  add column if not exists cert_senha       text;     -- senha criptografada via NFSE_CERT_KEY

-- 3. Dados do imóvel (locação imobiliária — NFS-e nacional)
alter table contratos
  add column if not exists imovel_cib              text,     -- CIB: AAAAAAA-D (Cadastro Imobiliário Brasileiro)
  add column if not exists imovel_inscricao_fiscal text,     -- Inscrição imobiliária municipal (IPTU)
  add column if not exists imovel_finalidade       text,     -- 'residencial' | 'comercial'
  add column if not exists imovel_logradouro       text,
  add column if not exists imovel_numero           text,
  add column if not exists imovel_complemento      text,
  add column if not exists imovel_bairro           text,
  add column if not exists imovel_cep              text,
  add column if not exists imovel_cod_mun          text,     -- Código IBGE 7 dígitos do município do imóvel
  add column if not exists imovel_mun_nome         text,
  add column if not exists cod_nbs                 text;     -- NBS: '1.1002.10.00' (residencial) ou '1.1002.20.00' (comercial)

-- Índice para busca por flag de contabilidade (útil em queries de admin)
create index if not exists idx_profiles_is_contabilidade
  on profiles(is_contabilidade)
  where is_contabilidade = true;
