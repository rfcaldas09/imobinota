-- Migração: atualiza coluna status de contratos para Ativo/Inativo
-- Passo 1: remove o check constraint antigo (que só aceitava Pago/Pendente/Em Atraso)
ALTER TABLE contratos
  DROP CONSTRAINT IF EXISTS contratos_status_check;

-- Passo 2: migra os valores existentes para 'Ativo'
UPDATE contratos
SET status = 'Ativo'
WHERE status IN ('Pago', 'Pendente', 'Em Atraso')
   OR status IS NULL
   OR status NOT IN ('Ativo', 'Inativo');

-- Passo 3: recria o constraint com os novos valores permitidos
ALTER TABLE contratos
  ADD CONSTRAINT contratos_status_check
  CHECK (status IN ('Ativo', 'Inativo'));

-- Passo 4: define 'Ativo' como padrão
ALTER TABLE contratos
  ALTER COLUMN status SET DEFAULT 'Ativo';

-- Verificação
SELECT status, COUNT(*) FROM contratos GROUP BY status;
