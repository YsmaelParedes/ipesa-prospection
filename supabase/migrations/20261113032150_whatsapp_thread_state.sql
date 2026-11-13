-- Conversaciones de WhatsApp precalculadas.
-- Antes, la vista whatsapp_threads recalculaba TODOS los mensajes de la tienda en
-- cada consulta (lista de chats cada 15 s y "no leídos" cada 30 s por persona).
-- Ahora una tabla guarda una fila por conversación y triggers por instrucción la
-- mantienen al día; la vista conserva su nombre y columnas, así que el código no cambia.

create table if not exists public.whatsapp_thread_state (
  store_id        uuid not null references public.stores(id) on delete cascade,
  phone           text not null,
  last_body       text,
  last_direction  text,
  last_status     text,
  last_media_type text,
  last_template   text,
  last_at         timestamptz not null,
  unread          integer not null default 0,
  last_inbound_at timestamptz,
  profile_name    text,
  contact_id      uuid,
  primary key (store_id, phone)
);

create index if not exists whatsapp_thread_state_recent_idx
  on public.whatsapp_thread_state (store_id, last_at desc);
create index if not exists whatsapp_thread_state_unread_idx
  on public.whatsapp_thread_state (store_id, last_at desc) where unread > 0;

alter table public.whatsapp_thread_state enable row level security;
revoke all on public.whatsapp_thread_state from anon, authenticated;
grant select, insert, update, delete on public.whatsapp_thread_state to service_role;

-- Recalcula las conversaciones indicadas, con las mismas reglas que la vista anterior.
create or replace function public.refresh_whatsapp_threads(p_store uuid[], p_phone text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k record;
begin
  -- Candado por conversación, en orden fijo para no bloquearse entre sí: si dos
  -- mensajes del mismo número llegan juntos, el segundo recalcula ya con el primero.
  for k in
    select distinct s, p from unnest(p_store, p_phone) as x(s, p) where s is not null and p is not null order by s, p
  loop
    perform pg_advisory_xact_lock(hashtextextended(k.s::text || ':' || k.p, 0));
  end loop;

  delete from public.whatsapp_thread_state t
  using unnest(p_store, p_phone) as x(s, p)
  where t.store_id = x.s and t.phone = x.p
    and not exists (select 1 from public.whatsapp_messages m where m.store_id = x.s and m.phone = x.p);

  insert into public.whatsapp_thread_state as t (
    store_id, phone, last_body, last_direction, last_status, last_media_type, last_template,
    last_at, unread, last_inbound_at, profile_name, contact_id)
  select x.s, x.p, l.body, l.direction, l.status, l.media_type, l.template_name, l.created_at,
    (select count(*)::integer from public.whatsapp_messages u
      where u.store_id = x.s and u.phone = x.p and u.direction = 'inbound' and u.read_at is null),
    (select max(i.created_at) from public.whatsapp_messages i
      where i.store_id = x.s and i.phone = x.p and i.direction = 'inbound'),
    (select pn.profile_name from public.whatsapp_messages pn
      where pn.store_id = x.s and pn.phone = x.p and pn.profile_name is not null
      order by pn.created_at desc, pn.id desc limit 1),
    (select c.contact_id from public.whatsapp_messages c
      where c.store_id = x.s and c.phone = x.p and c.contact_id is not null
      order by c.created_at desc, c.id desc limit 1)
  from (select distinct s, p from unnest(p_store, p_phone) as y(s, p) where s is not null and p is not null) x
  cross join lateral (
    select m.body, m.direction, m.status, m.media_type, m.template_name, m.created_at
    from public.whatsapp_messages m
    where m.store_id = x.s and m.phone = x.p
    order by m.created_at desc, m.id desc
    limit 1
  ) l
  on conflict (store_id, phone) do update set
    last_body = excluded.last_body, last_direction = excluded.last_direction,
    last_status = excluded.last_status, last_media_type = excluded.last_media_type,
    last_template = excluded.last_template, last_at = excluded.last_at, unread = excluded.unread,
    last_inbound_at = excluded.last_inbound_at, profile_name = excluded.profile_name,
    contact_id = excluded.contact_id;
end;
$$;

revoke all on function public.refresh_whatsapp_threads(uuid[], text[]) from public, anon, authenticated;

-- Un trigger por tipo de instrucción (las tablas de transición no admiten varios eventos a la vez).
create or replace function public.whatsapp_threads_after_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.refresh_whatsapp_threads(
    (select array_agg(store_id) from (select distinct store_id, phone from new_rows) d),
    (select array_agg(phone)    from (select distinct store_id, phone from new_rows) d));
  return null;
end; $$;

create or replace function public.whatsapp_threads_after_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.refresh_whatsapp_threads(
    (select array_agg(store_id) from (select store_id, phone from new_rows union select store_id, phone from old_rows) d),
    (select array_agg(phone)    from (select store_id, phone from new_rows union select store_id, phone from old_rows) d));
  return null;
end; $$;

create or replace function public.whatsapp_threads_after_delete() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.refresh_whatsapp_threads(
    (select array_agg(store_id) from (select distinct store_id, phone from old_rows) d),
    (select array_agg(phone)    from (select distinct store_id, phone from old_rows) d));
  return null;
end; $$;

revoke all on function public.whatsapp_threads_after_insert() from public, anon, authenticated;
revoke all on function public.whatsapp_threads_after_update() from public, anon, authenticated;
revoke all on function public.whatsapp_threads_after_delete() from public, anon, authenticated;

drop trigger if exists whatsapp_threads_refresh_insert on public.whatsapp_messages;
drop trigger if exists whatsapp_threads_refresh_update on public.whatsapp_messages;
drop trigger if exists whatsapp_threads_refresh_delete on public.whatsapp_messages;
create trigger whatsapp_threads_refresh_insert after insert on public.whatsapp_messages
  referencing new table as new_rows for each statement execute function public.whatsapp_threads_after_insert();
create trigger whatsapp_threads_refresh_update after update on public.whatsapp_messages
  referencing old table as old_rows new table as new_rows for each statement execute function public.whatsapp_threads_after_update();
create trigger whatsapp_threads_refresh_delete after delete on public.whatsapp_messages
  referencing old table as old_rows for each statement execute function public.whatsapp_threads_after_delete();

-- Carga inicial con todo lo que ya existe.
select public.refresh_whatsapp_threads(array_agg(store_id), array_agg(phone))
from (select distinct store_id, phone from public.whatsapp_messages) d;

-- La vista conserva nombre, columnas y orden: el código sigue igual.
create or replace view public.whatsapp_threads as
select phone, last_body, last_direction, last_status, last_media_type, last_template,
       last_at, unread, last_inbound_at, profile_name, contact_id, store_id
from public.whatsapp_thread_state;
