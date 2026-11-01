-- Rollback de 20261030160000_restrict_row_owner_writes.sql
--
-- Restaura o estado logo após 20261030150000_unique_evolution_instance:
--   * remove as policies RESTRICTIVE "row owner must belong to org (insert|update)"
--     das 25 tabelas (MT-01) e "org admin only writes (insert|update|delete)"
--     de agent_configs, rag_documents, rag_document_chunks e icp_settings (MT-03);
--   * remove public.is_org_member_user(uuid, uuid);
--   * remove o DEFAULT auth.uid() de lead_notes.user_id e audit_logs.user_id;
--   * trigger_set_conversation_user_id volta à definição original
--     (20250116_whatsapp_conversations.sql: BEFORE INSERT, FOR EACH ROW);
--   * devolve TRUNCATE, TRIGGER e REFERENCES a anon/authenticated em todas as
--     tabelas do public (estado de produção antes da 160000) e nos default
--     privileges do role postgres, e reafirma as exceções que já existiam
--     antes (20261030130000): sem TRUNCATE em organization_members e
--     user_settings, e nenhum privilégio em platform_admins para anon/authenticated.
--
-- ATENÇÃO: depois do rollback, uma conversa volta a poder ser repontada para
-- lead de outro tenant (MT-04), e writers de uma organização voltam a gravar
-- linhas com user_id de usuários de outras organizações (MT-01), operadores
-- voltam a alterar agente/RAG/ICP pelo client da sessão (MT-03) e
-- anon/authenticated voltam a ter TRUNCATE (ignora RLS) nas tabelas do public.

do $$
declare
  v_tabela text;
  v_mt01 constant text[] := array[
    'agent_configs', 'audit_logs', 'campaign_sends', 'campaigns',
    'cliente_historico', 'clientes', 'companies', 'contacts', 'enrichment_raw',
    'followup_schedules', 'icp_settings', 'import_history', 'lead_notes',
    'leads_prospeccao', 'linkedin_raw', 'linkedin_suppression_list',
    'message_logs', 'message_templates', 'prospecting_channels',
    'prospecting_jobs', 'rag_document_chunks', 'rag_documents',
    'search_history', 'webhook_keys', 'whatsapp_conversations'
  ];
  v_mt03 constant text[] := array[
    'agent_configs', 'rag_documents', 'rag_document_chunks', 'icp_settings'
  ];
begin
  foreach v_tabela in array v_mt01 loop
    if to_regclass(format('public.%I', v_tabela)) is not null then
      execute format('drop policy if exists %I on public.%I',
                     'row owner must belong to org (insert)', v_tabela);
      execute format('drop policy if exists %I on public.%I',
                     'row owner must belong to org (update)', v_tabela);
    end if;
  end loop;

  foreach v_tabela in array v_mt03 loop
    if to_regclass(format('public.%I', v_tabela)) is not null then
      execute format('drop policy if exists %I on public.%I',
                     'org admin only writes (insert)', v_tabela);
      execute format('drop policy if exists %I on public.%I',
                     'org admin only writes (update)', v_tabela);
      execute format('drop policy if exists %I on public.%I',
                     'org admin only writes (delete)', v_tabela);
    end if;
  end loop;
end $$;

drop function if exists public.is_org_member_user(uuid, uuid);

drop trigger if exists trigger_set_conversation_user_id on public.whatsapp_conversations;
create trigger trigger_set_conversation_user_id
  before insert on public.whatsapp_conversations
  for each row
  execute function public.set_conversation_user_id();

alter table public.lead_notes alter column user_id drop default;
alter table public.audit_logs alter column user_id drop default;

grant truncate, trigger, references on all tables in schema public to anon, authenticated;

alter default privileges for role postgres in schema public
  grant truncate, trigger, references on tables to anon, authenticated;

-- Exceções que já existiam antes da 160000 (20261030130000).
revoke truncate on public.organization_members from anon, authenticated;
revoke truncate on public.user_settings from anon, authenticated;
revoke all on public.platform_admins from public, anon, authenticated;
