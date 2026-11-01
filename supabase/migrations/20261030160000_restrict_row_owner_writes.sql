-- 20261030160000_restrict_row_owner_writes.sql
-- Sprint 1 (segurança), rodada final de correções.
--
-- Depende de 20261030150000_unique_evolution_instance (rodar DEPOIS) e de
-- 20261030130000 (is_platform_admin / platform_admins) e 20261030120000
-- (default privileges: função nova nasce SEM EXECUTE para anon/authenticated,
-- então o grant abaixo é explícito).
-- Rollback: supabase/migrations/rollback/20261030160000_restrict_row_owner_writes.down.sql
-- Testes:   tests/db/row-owner-org-writes.sql (todos ok=true depois)
--           tests/db/function-privileges.sql (is_org_member_user no grupo B)
--
-- 1. MT-01 (HIGH): nas 25 tabelas com user_id + organization_id, as policies
--    PERMISSIVE "org writers can insert/update/delete <tabela>" só checam
--    is_org_writer(organization_id). Um writer da Org A gravava linhas da
--    própria org com user_id de um usuário da Org B (ou trocava o user_id de
--    uma linha para B). Como várias rotas/serviços resolvem o tenant pelo
--    user_id, a linha "vazava" para o tenant B (ex.: webhook_keys,
--    agent_configs, followup_schedules).
--    Correção: policies RESTRICTIVE de INSERT e UPDATE exigindo que o dono da
--    linha seja o próprio usuário OU membro da organização da linha.
--    service_role tem BYPASSRLS e não é afetado.
-- 2. MT-03 (LOW): agent_configs, rag_documents, rag_document_chunks e
--    icp_settings: escrita (INSERT/UPDATE/DELETE) só pelo admin da organização
--    (ou admin da plataforma) também no banco, não só nas rotas. Linhas sem
--    organização (tenant legado sem org) continuam com as regras atuais.
-- 4. MT-04 (HIGH): o trigger trigger_set_conversation_user_id só rodava no
--    INSERT. Um writer repontava lead_id da própria conversa para um lead de
--    outro tenant e a linha (com o user_id antigo) passava a aparecer no
--    histórico daquele lead. Agora o trigger roda também em UPDATE OF lead_id:
--    user_id vira o dono do novo lead e a policy RESTRICTIVE de UPDATE (item 1)
--    rejeita quando esse dono não é da organização da linha.
-- 3. DB F-01 (LOW): anon/authenticated perdem TRUNCATE, TRIGGER e REFERENCES
--    em todas as tabelas do public (TRUNCATE ignora RLS e triggers de linha;
--    nenhum caminho do app usa esses privilégios), inclusive nas tabelas
--    criadas depois (default privileges do role postgres).
--    Em produção, user_id é NOT NULL nas 25 tabelas, exceto audit_logs e
--    lead_notes (nulável, sem default e sem trigger), leads_prospeccao
--    (set_user_id_trigger) e whatsapp_conversations
--    (trigger_set_conversation_user_id). Para que um insert pelo client da
--    sessão sem user_id não passe a falhar com 42501, audit_logs e lead_notes
--    ganham DEFAULT auth.uid().
--
-- Idempotente: pode ser reaplicada sem erro.

-- ---------------------------------------------------------------------------
-- Helper (grupo B: helper de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member_user(p_user_id uuid, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Só responde para quem é membro de p_org_id: nas policies a org da linha é
  -- sempre a do chamador (is_org_writer), então a semântica não muda, e um
  -- usuário de fora não consegue sondar o vínculo de terceiros.
  select public.is_org_member(p_org_id)
     and exists (
       select 1
       from public.organization_members
       where user_id = p_user_id
         and organization_id = p_org_id
     );
$$;

alter function public.is_org_member_user(uuid, uuid) owner to postgres;

comment on function public.is_org_member_user(uuid, uuid) is
  'true se p_user_id é membro de p_org_id (organization_members) E o chamador também é membro de p_org_id. '
  'Usada pelas policies RESTRICTIVE '
  '"row owner must belong to org (insert|update)" (MT-01).';

revoke execute on function public.is_org_member_user(uuid, uuid) from public, anon;
grant  execute on function public.is_org_member_user(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. MT-01: dono da linha precisa ser o próprio usuário ou membro da org
-- ---------------------------------------------------------------------------
-- Tabelas com user_id nulável e sem trigger que o preencha: o dono passa a ser
-- o usuário da sessão quando o insert não informa user_id.
alter table public.lead_notes alter column user_id set default auth.uid();
alter table public.audit_logs alter column user_id set default auth.uid();

do $$
declare
  v_tabela text;
  v_tabelas constant text[] := array[
    'agent_configs', 'audit_logs', 'campaign_sends', 'campaigns',
    'cliente_historico', 'clientes', 'companies', 'contacts', 'enrichment_raw',
    'followup_schedules', 'icp_settings', 'import_history', 'lead_notes',
    'leads_prospeccao', 'linkedin_raw', 'linkedin_suppression_list',
    'message_logs', 'message_templates', 'prospecting_channels',
    'prospecting_jobs', 'rag_document_chunks', 'rag_documents',
    'search_history', 'webhook_keys', 'whatsapp_conversations'
  ];
  c_check constant text :=
    '(user_id = auth.uid() or (organization_id is not null and public.is_org_member_user(user_id, organization_id)))';
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass(format('public.%I', v_tabela)) is null then
      raise exception 'tabela public.% não encontrada (MT-01)', v_tabela;
    end if;

    execute format('drop policy if exists %I on public.%I',
                   'row owner must belong to org (insert)', v_tabela);
    execute format('create policy %I on public.%I as restrictive for insert with check %s',
                   'row owner must belong to org (insert)', v_tabela, c_check);

    execute format('drop policy if exists %I on public.%I',
                   'row owner must belong to org (update)', v_tabela);
    execute format('create policy %I on public.%I as restrictive for update with check %s',
                   'row owner must belong to org (update)', v_tabela, c_check);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. MT-03: agente / RAG / ICP só pelo admin da organização (ou da plataforma)
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabela text;
  v_tabelas constant text[] := array[
    'agent_configs', 'rag_documents', 'rag_document_chunks', 'icp_settings'
  ];
  c_admin constant text :=
    '(organization_id is null or public.is_org_admin(organization_id) or public.is_platform_admin())';
begin
  foreach v_tabela in array v_tabelas loop
    if to_regclass(format('public.%I', v_tabela)) is null then
      raise exception 'tabela public.% não encontrada (MT-03)', v_tabela;
    end if;

    execute format('drop policy if exists %I on public.%I',
                   'org admin only writes (insert)', v_tabela);
    execute format('create policy %I on public.%I as restrictive for insert with check %s',
                   'org admin only writes (insert)', v_tabela, c_admin);

    execute format('drop policy if exists %I on public.%I',
                   'org admin only writes (update)', v_tabela);
    execute format('create policy %I on public.%I as restrictive for update using %s with check %s',
                   'org admin only writes (update)', v_tabela, c_admin, c_admin);

    execute format('drop policy if exists %I on public.%I',
                   'org admin only writes (delete)', v_tabela);
    execute format('create policy %I on public.%I as restrictive for delete using %s',
                   'org admin only writes (delete)', v_tabela, c_admin);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. MT-04: user_id da conversa acompanha o dono do lead também no UPDATE
--    (função public.set_conversation_user_id inalterada)
-- ---------------------------------------------------------------------------
drop trigger if exists trigger_set_conversation_user_id on public.whatsapp_conversations;
create trigger trigger_set_conversation_user_id
  before insert or update of lead_id on public.whatsapp_conversations
  for each row
  execute function public.set_conversation_user_id();

-- ---------------------------------------------------------------------------
-- 3. DB F-01: sem TRUNCATE / TRIGGER / REFERENCES para anon e authenticated
-- ---------------------------------------------------------------------------
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
