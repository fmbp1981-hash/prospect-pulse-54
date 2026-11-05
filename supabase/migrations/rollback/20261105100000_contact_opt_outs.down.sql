-- Rollback de 20261105100000_contact_opt_outs.sql
--
-- Restaura o estado logo após 20261031100000_organization_connections:
-- remove public.contact_opt_out_events e public.contact_opt_outs (com
-- policies, triggers, índices e grants). public.set_updated_at() é anterior a
-- esta migration e fica. Nenhuma tabela existente é alterada.
--
-- ATENÇÃO: apaga as oposições registradas e o histórico, que são prova de
-- atendimento ao direito de oposição (LGPD). Exporte as duas tabelas para
-- scripts/legacy/backup-<data>-opt-outs.json ANTES de rodar (regra de produção
-- do CLAUDE.md). Depois do rollback, o código das tasks seguintes do opt-out
-- deixa de funcionar: reverta-o antes.
--
-- Ordem: rode antes rollback/20261105110000_contact_opt_outs_hardening.down.sql.
-- Trava: recusa se houver qualquer linha, a menos que a sessão confirme
--   set app.confirm_drop_opt_out_evidence = 'yes';
-- (só depois do export). Histórico de migrations: depois de rodar, marque a
-- versão como revertida (supabase migration repair --status reverted
-- 20261105100000, ou o delete equivalente em supabase_migrations.schema_migrations).

do $$
declare
  v_tabela text;
  v_tem_linhas boolean := false;
  v_row_security text := current_setting('row_security');
begin
  -- Sem RLS na contagem: um papel sem BYPASSRLS enxergaria as tabelas vazias
  -- (FORCE RLS) e a trava liberaria. Com row_security off, esse papel recebe
  -- erro e a trava falha fechada.
  perform set_config('row_security', 'off', true);
  -- SQL dinâmico: as tabelas podem não existir (rollback reexecutado)
  foreach v_tabela in array array['public.contact_opt_outs', 'public.contact_opt_out_events'] loop
    if not v_tem_linhas and to_regclass(v_tabela) is not null then
      execute format('select exists (select 1 from %s)', v_tabela) into v_tem_linhas;
    end if;
  end loop;
  perform set_config('row_security', v_row_security, true);
  if v_tem_linhas
     and coalesce(current_setting('app.confirm_drop_opt_out_evidence', true), '') <> 'yes' then
    raise exception 'rollback recusado: há oposições/histórico (prova LGPD). Exporte e rode set app.confirm_drop_opt_out_evidence = ''yes'' antes.';
  end if;
end $$;

drop table if exists public.contact_opt_out_events;
drop table if exists public.contact_opt_outs;
