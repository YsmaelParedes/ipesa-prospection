-- Observaciones de una tienda, entrega 1 (Comercial y Agenda).
-- Todo es aditivo: el código anterior sigue funcionando con esta migración aplicada.
--
-- 1. commercial_events: lo que se le hace a un cliente sin ser una actividad
--    (cambiar la fecha del seguimiento, corregir un monto, borrar una actividad).
--    Se ve en su historial pero no cuenta para las metas ni para el Acumulado.
-- 2. commercial_activities.prev_state: cómo estaba el cliente antes de cada
--    actividad, para poder borrar la última y dejarlo como estaba.
-- 3. Funciones para cambiar la fecha, corregir un monto y borrar la última actividad.
-- 4. decide_quote: «Rechazada» puede registrar «No interesado» en Comercial (una vez).

-- ── 1. Historial de cambios ─────────────────────────────────────────────────
create table public.commercial_events (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  contact_id uuid not null,
  user_id    uuid references auth.users(id) on delete set null,
  kind       text not null constraint commercial_events_kind_check check (kind in ('fecha', 'monto', 'borrado')),
  detail     text not null constraint commercial_events_detail_check check (char_length(detail) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint commercial_events_contact_same_store_fkey
    foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete cascade
);
create index commercial_events_contact_idx on public.commercial_events (store_id, contact_id, created_at desc);
create index commercial_events_user_id_idx on public.commercial_events (user_id);
alter table public.commercial_events enable row level security;
revoke all on public.commercial_events from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_events to service_role;

-- ── 2. Cómo estaba el cliente antes de cada actividad ───────────────────────
alter table public.commercial_activities add column prev_state jsonb;

create or replace function public.log_commercial_activity(p_store uuid, p_actor uuid, p_contact uuid, p_kind text, p_result text, p_note text, p_quote numeric, p_sale numeric, p_next_action text, p_next_at date, p_status text, p_claim boolean)
 returns public.commercial_activities
 language plpgsql
 security definer
 set search_path to ''
as $$
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
    next_action, next_action_at, is_followup, prev_state
  ) values (
    p_store, p_contact, p_actor, p_kind, p_result, nullif(btrim(p_note), ''), p_quote, p_sale,
    case when p_kind = 'nota' then c.next_action else p_next_action end,
    case when p_kind = 'nota' then c.next_action_at else p_next_at end,
    p_kind <> 'nota' and c.last_activity_at is not null,
    jsonb_build_object(
      'owner_id', c.owner_id, 'commercial_status', c.commercial_status,
      'next_action', c.next_action, 'next_action_at', c.next_action_at,
      'last_activity_at', c.last_activity_at, 'last_result', c.last_result,
      'last_note', c.last_note, 'no_answer_streak', c.no_answer_streak)
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
                             when p_result is null or p_result in ('enviado', 'correo_incorrecto') then c.no_answer_streak
                             else 0 end,
    updated_at        = now()
  where id = p_contact and store_id = p_store;

  return v_row;
end $$;
revoke all on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) to service_role;

-- ── 3a. Cambiar (o poner) la fecha del seguimiento sin registrar actividad ──
-- Quién puede (responsable, administrador o cualquiera si no tiene) lo revisa la API.
create or replace function public.commercial_set_followup(p_store uuid, p_actor uuid, p_contact uuid, p_next_at date, p_next_action text, p_detail text)
 returns public.contacts
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  c public.contacts%rowtype;
begin
  if p_next_at is null then raise exception 'Elige la fecha' using errcode = 'P0001'; end if;
  update public.contacts set
    next_action    = coalesce(nullif(btrim(p_next_action), ''), next_action, 'Dar seguimiento'),
    next_action_at = p_next_at,
    updated_at     = now()
  where id = p_contact and store_id = p_store
  returning * into c;
  if not found then raise exception 'Contacto no encontrado' using errcode = 'P0002'; end if;
  insert into public.commercial_events (store_id, contact_id, user_id, kind, detail)
  values (p_store, p_contact, p_actor, 'fecha', p_detail);
  return c;
end $$;
revoke all on function public.commercial_set_followup(uuid, uuid, uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.commercial_set_followup(uuid, uuid, uuid, date, text, text) to service_role;

-- ── 3b. Corregir el monto de una cotización o venta registrada ──────────────
create or replace function public.commercial_fix_amount(p_store uuid, p_actor uuid, p_activity uuid, p_amount numeric, p_detail text)
 returns public.commercial_activities
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  a public.commercial_activities%rowtype;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Escribe un monto mayor que cero' using errcode = 'P0001'; end if;
  select * into a from public.commercial_activities where id = p_activity and store_id = p_store for update;
  if not found then raise exception 'Actividad no encontrada' using errcode = 'P0002'; end if;
  if a.contact_id is null then raise exception 'El cliente de esta actividad ya no existe' using errcode = 'P0001'; end if;
  if a.quote_amount is null and a.sale_amount is null then
    raise exception 'Esta actividad no tiene monto' using errcode = 'P0001';
  end if;
  update public.commercial_activities set
    quote_amount = case when a.quote_amount is not null then p_amount end,
    sale_amount  = case when a.sale_amount is not null then p_amount end
  where id = p_activity
  returning * into a;
  insert into public.commercial_events (store_id, contact_id, user_id, kind, detail)
  values (p_store, a.contact_id, p_actor, 'monto', p_detail);
  return a;
end $$;
revoke all on function public.commercial_fix_amount(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.commercial_fix_amount(uuid, uuid, uuid, numeric, text) to service_role;

-- ── 3c. Borrar la última actividad de un cliente y dejarlo como estaba ──────
-- p_restore: cómo debe quedar el cliente si la actividad es anterior a
-- prev_state (la API lo calcula con el historial). Con prev_state, manda prev_state.
create or replace function public.commercial_delete_last_activity(p_store uuid, p_actor uuid, p_activity uuid, p_restore jsonb, p_detail text)
 returns public.contacts
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  a      public.commercial_activities%rowtype;
  c      public.contacts%rowtype;
  v_last uuid;
  s      jsonb;
begin
  select * into a from public.commercial_activities where id = p_activity and store_id = p_store;
  if not found then raise exception 'Actividad no encontrada' using errcode = 'P0002'; end if;
  if a.contact_id is null then raise exception 'El cliente de esta actividad ya no existe' using errcode = 'P0001'; end if;
  select * into c from public.contacts where id = a.contact_id and store_id = p_store for update;
  if not found then raise exception 'Contacto no encontrado' using errcode = 'P0002'; end if;

  -- Solo la más reciente: si no, el cliente quedaría en un estado que nunca tuvo
  select id into v_last from public.commercial_activities
   where store_id = p_store and contact_id = a.contact_id
   order by created_at desc, id desc limit 1;
  if v_last is distinct from a.id then
    raise exception 'Solo se puede borrar la actividad más reciente del cliente' using errcode = 'P0001';
  end if;

  s := coalesce(a.prev_state, p_restore);
  if s is null then raise exception 'No se sabe cómo estaba el cliente antes' using errcode = 'P0001'; end if;

  delete from public.commercial_activities where id = a.id;

  update public.contacts set
    owner_id          = case when s ? 'owner_id' then (s->>'owner_id')::uuid else c.owner_id end,
    commercial_status = coalesce(s->>'commercial_status', c.commercial_status),
    next_action       = s->>'next_action',
    next_action_at    = (s->>'next_action_at')::date,
    last_activity_at  = (s->>'last_activity_at')::timestamptz,
    last_result       = s->>'last_result',
    last_note         = s->>'last_note',
    no_answer_streak  = coalesce((s->>'no_answer_streak')::int, 0),
    updated_at        = now()
  where id = c.id
  returning * into c;

  insert into public.commercial_events (store_id, contact_id, user_id, kind, detail)
  values (p_store, c.id, p_actor, 'borrado', p_detail);
  return c;
end $$;
revoke all on function public.commercial_delete_last_activity(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.commercial_delete_last_activity(uuid, uuid, uuid, jsonb, text) to service_role;

-- ── 4. Rechazada → «No interesado» en Comercial (una sola vez) ──────────────
alter table public.quotes add column lost_activity_id uuid
  constraint quotes_lost_activity_id_fkey references public.commercial_activities(id) on delete set null;
create index quotes_lost_activity_id_idx on public.quotes (lost_activity_id);

-- p_sale: «registrar en Comercial» — la venta al aceptar, «No interesado» al rechazar.
-- Misma firma que antes: el código anterior la sigue llamando igual.
create or replace function public.decide_quote(p_store uuid, p_actor uuid, p_quote uuid, p_status text, p_sale boolean, p_kind text, p_today date)
 returns public.quotes
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  q          public.quotes%rowtype;
  v_activity public.commercial_activities%rowtype;
begin
  if p_status not in ('accepted', 'rejected', 'sent') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;
  if p_kind not in ('whatsapp', 'correo', 'visita') then
    raise exception 'Tipo de actividad inválido' using errcode = 'P0001';
  end if;
  select * into q from public.quotes where id = p_quote and store_id = p_store for update;
  if not found then raise exception 'Cotización no encontrada' using errcode = 'P0002'; end if;
  if q.status = 'draft' then
    raise exception 'Primero envía la cotización' using errcode = 'P0001';
  end if;

  if p_status = 'accepted' and coalesce(p_sale, false) and q.contact_id is not null and q.sale_activity_id is null then
    v_activity := public.log_commercial_activity(
      p_store, p_actor, q.contact_id, p_kind, 'venta', 'Cotización #' || q.folio || ' aceptada', null, q.total,
      'Ofrecer recompra', p_today + 30, 'cliente', true);
    q.sale_activity_id := v_activity.id;
  end if;

  if p_status = 'rejected' and coalesce(p_sale, false) and q.contact_id is not null and q.lost_activity_id is null then
    v_activity := public.log_commercial_activity(
      p_store, p_actor, q.contact_id, p_kind, 'no_interesado', 'Cotización #' || q.folio || ' rechazada', null, null,
      'Volver a ofrecer', p_today + 90, 'no_interesado', true);
    q.lost_activity_id := v_activity.id;
  end if;

  update public.quotes set
    status           = p_status,
    decided_at       = case when p_status = 'sent' then null else now() end,
    sale_activity_id = q.sale_activity_id,
    lost_activity_id = q.lost_activity_id,
    updated_at       = now()
  where id = p_quote
  returning * into q;
  return q;
end $$;
revoke all on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) from public, anon, authenticated;
grant execute on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) to service_role;
