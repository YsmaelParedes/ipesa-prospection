-- Sistema comercial: quien registra una actividad (llamada, WhatsApp o visita)
-- se queda con el contacto, aunque tuviera otro responsable. Ya no se reasigna
-- a mano. Una nota no cambia el responsable.
create or replace function public.log_commercial_activity(
  p_store uuid, p_actor uuid, p_contact uuid, p_kind text, p_result text, p_note text,
  p_quote numeric, p_sale numeric, p_next_action text, p_next_at date, p_status text, p_claim boolean
) returns public.commercial_activities
language plpgsql security definer set search_path = '' as $$
declare
  c     public.contacts%rowtype;
  v_row public.commercial_activities%rowtype;
begin
  select * into c from public.contacts where id = p_contact and store_id = p_store for update;
  if not found then raise exception 'Contacto no encontrado' using errcode = 'P0002'; end if;
  -- Sin p_claim solo registra su responsable (o cualquiera si no tiene)
  if not coalesce(p_claim, false) and c.owner_id is not null and c.owner_id is distinct from p_actor then
    raise exception 'Este contacto lo trabaja otra persona del equipo' using errcode = 'P0001';
  end if;

  insert into public.commercial_activities (
    store_id, contact_id, user_id, kind, result, note, quote_amount, sale_amount,
    next_action, next_action_at, is_followup
  ) values (
    p_store, p_contact, p_actor, p_kind, p_result, nullif(btrim(p_note), ''), p_quote, p_sale,
    case when p_kind = 'nota' then c.next_action else p_next_action end,
    case when p_kind = 'nota' then c.next_action_at else p_next_at end,
    p_kind <> 'nota' and c.last_activity_at is not null
  ) returning * into v_row;

  update public.contacts set
    owner_id          = case when coalesce(p_claim, false) and p_kind <> 'nota' then p_actor else coalesce(c.owner_id, p_actor) end,
    commercial_status = coalesce(p_status, c.commercial_status),
    next_action       = v_row.next_action,
    next_action_at    = v_row.next_action_at,
    last_activity_at  = case when p_kind = 'nota' then c.last_activity_at else v_row.created_at end,
    last_result       = coalesce(p_result, c.last_result),
    last_note         = coalesce(v_row.note, c.last_note),
    no_answer_streak  = case when p_result = 'no_contesta' then c.no_answer_streak + 1
                             when p_result is null then c.no_answer_streak else 0 end,
    updated_at        = now()
  where id = p_contact and store_id = p_store;

  return v_row;
end $$;
revoke all on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) to service_role;
