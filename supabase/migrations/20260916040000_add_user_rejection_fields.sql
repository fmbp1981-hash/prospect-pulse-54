-- Item 2 do plano pós multi-tenant (docs/PLANO-PENDENCIAS-MULTITENANT.md):
-- fluxo de aprovação de usuários pendentes já existia (approve-user,
-- list-users, RoleManagement.tsx), mas só tinha o caminho de aprovação —
-- faltava rejeitar (reversível: um usuário rejeitado pode ser aprovado
-- depois, por decisão explícita do usuário) e excluir manualmente.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id);
