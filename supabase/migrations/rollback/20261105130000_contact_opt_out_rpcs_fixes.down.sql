-- Rollback de 20261105130000_contact_opt_out_rpcs_fixes.sql
--
-- Volta public.register_contact_opt_out à versão de 20261105120000 (cópia
-- literal abaixo). Não apaga nem altera linhas de contact_opt_outs ou
-- contact_opt_out_events: linhas criadas pela correção H-1 (identificador que
-- ganhou linha própria) continuam ativas, como deve ser numa oposição.
--
-- Histórico de migrations: depois de rodar, marque a versão como revertida
-- (supabase migration repair --status reverted 20261105130000, ou
-- delete from supabase_migrations.schema_migrations where version = '20261105130000').

-- ---------------------------------------------------------------------------
-- 1. register_contact_opt_out
-- ---------------------------------------------------------------------------
create or replace function public.register_contact_opt_out(
  p_organization_id     uuid,
  p_source              text,
  p_actor_type          text,
  p_phone_e164          text default null,
  p_email_normalized    text default null,
  p_actor_user_id       uuid default null,
  p_lead_id             text default null,
  p_evidence_message_id text default null
)
returns table (opt_out_id uuid, changed boolean)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_attempt int := 0;
  v_phone   public.contact_opt_outs%rowtype;
  v_email   public.contact_opt_outs%rowtype;
  v_row     public.contact_opt_outs%rowtype;
  v_id      uuid;
  v_primary uuid;
  v_changed boolean;
begin
  if p_organization_id is null then
    raise exception 'register_contact_opt_out: organização obrigatória'
      using errcode = '22023';
  end if;
  if p_phone_e164 is null and p_email_normalized is null then
    raise exception 'register_contact_opt_out: informe telefone ou e-mail'
      using errcode = '22023';
  end if;
  if p_actor_type = 'usuario' then
    if p_actor_user_id is null then
      raise exception 'register_contact_opt_out: autor usuario sem id'
        using errcode = '22023';
    end if;
    if not exists (select 1 from public.organization_members m
                   where m.organization_id = p_organization_id
                     and m.user_id = p_actor_user_id
                     and m.role in ('admin', 'operador'))
       and not exists (select 1 from public.platform_admins pa
                       where pa.user_id = p_actor_user_id) then
      raise exception 'register_contact_opt_out: usuário sem permissão de escrita nesta organização'
        using errcode = '42501';
    end if;
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      v_phone := null;
      v_email := null;
      v_primary := null;
      v_changed := false;

      if p_phone_e164 is not null then
        select o.* into v_phone
          from public.contact_opt_outs o
         where o.organization_id = p_organization_id
           and o.phone_e164 = p_phone_e164
         for update;
      end if;
      if p_email_normalized is not null then
        select o.* into v_email
          from public.contact_opt_outs o
         where o.organization_id = p_organization_id
           and o.email_normalized = p_email_normalized
         for update;
      end if;

      if v_phone.id is null and v_email.id is null then
        insert into public.contact_opt_outs
          (organization_id, phone_e164, email_normalized, status, source, lead_id)
        values
          (p_organization_id, p_phone_e164, p_email_normalized, 'active', p_source, p_lead_id)
        returning id into v_id;

        insert into public.contact_opt_out_events
          (organization_id, opt_out_id, event_type, source, actor_type,
           actor_user_id, evidence_message_id)
        values
          (p_organization_id, v_id, 'opt_out', p_source, p_actor_type,
           p_actor_user_id, p_evidence_message_id);

        v_primary := v_id;
        v_changed := true;
      else
        -- Linha do telefone primeiro (é a devolvida); a do e-mail, se for outra.
        for v_row in
          select o.*
            from public.contact_opt_outs o
           where o.id in (v_phone.id, v_email.id)
           order by coalesce(o.id = v_phone.id, false) desc
        loop
          if v_row.status = 'revoked'
             or (v_row.phone_e164 is null and p_phone_e164 is not null and v_phone.id is null)
             or (v_row.email_normalized is null and p_email_normalized is not null and v_email.id is null)
             or (v_row.lead_id is null and p_lead_id is not null) then
            update public.contact_opt_outs o
               set phone_e164 = coalesce(o.phone_e164,
                                         case when v_phone.id is null then p_phone_e164 end),
                   email_normalized = coalesce(o.email_normalized,
                                               case when v_email.id is null then p_email_normalized end),
                   lead_id = coalesce(o.lead_id, p_lead_id),
                   status = 'active',
                   source = case when o.status = 'revoked' then p_source else o.source end,
                   opted_out_at = case when o.status = 'revoked' then now() else o.opted_out_at end,
                   revoked_at = null
             where o.id = v_row.id;
          end if;

          if v_row.status = 'revoked' then
            insert into public.contact_opt_out_events
              (organization_id, opt_out_id, event_type, source, actor_type,
               actor_user_id, evidence_message_id)
            values
              (p_organization_id, v_row.id, 'opt_out', p_source, p_actor_type,
               p_actor_user_id, p_evidence_message_id);
            v_changed := true;
          end if;

          v_primary := coalesce(v_primary, v_row.id);
        end loop;
      end if;

      exit;
    exception when unique_violation then
      -- Outra transação gravou a mesma pessoa entre a leitura e a escrita:
      -- relê (agora a linha dela existe). Três tentativas bastam.
      if v_attempt >= 3 then
        raise;
      end if;
    end;
  end loop;

  opt_out_id := v_primary;
  changed := v_changed;
  return next;
end $$;

comment on function public.register_contact_opt_out(uuid, text, text, text, text, uuid, text, text) is
  'Ativa a oposição (telefone E.164 e/ou e-mail normalizado) na organização e grava o evento opt_out na mesma transação, '
  'só se a situação mudar. Devolve (opt_out_id, changed). Uso exclusivo do service_role.';

revoke execute on function public.register_contact_opt_out(uuid, text, text, text, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_contact_opt_out(uuid, text, text, text, text, uuid, text, text)
  to service_role;
