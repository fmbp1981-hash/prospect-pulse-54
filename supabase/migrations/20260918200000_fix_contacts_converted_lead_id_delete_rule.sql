-- Corrige erro real ao apagar leads: contacts.converted_lead_id -> leads_prospeccao(id)
-- estava com ON DELETE NO ACTION (padrão do Postgres quando nenhuma regra é
-- especificada), então apagar QUALQUER lead promovido de um contato do
-- LinkedIn (fluxo /api/contacts/[id]/promote) violava a constraint e falhava
-- com erro de foreign key. Confirmado em produção: os 3 leads do usuário
-- fmbp1981@gmail.com foram todos promovidos de contatos LinkedIn, então
-- 100% das tentativas de apagar lead davam erro.
--
-- Fix: ON DELETE SET NULL. Preserva o contato do LinkedIn (e o histórico em
-- linkedin_raw) — só desfaz o vínculo com o lead apagado, permitindo
-- promovê-lo de novo no futuro se necessário. CASCADE seria destrutivo
-- demais (apagaria o contato inteiro, perdendo o histórico de prospecção).
--
-- A tabela `contacts` (e seu FK) não tem CREATE TABLE em nenhuma migration
-- deste repositório — foi criada direto no banco em algum momento (schema
-- drift). Este arquivo só corrige a regra da constraint existente; não
-- recria a tabela.

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_converted_lead_id_fkey;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_converted_lead_id_fkey
  FOREIGN KEY (converted_lead_id)
  REFERENCES public.leads_prospeccao(id)
  ON DELETE SET NULL;
