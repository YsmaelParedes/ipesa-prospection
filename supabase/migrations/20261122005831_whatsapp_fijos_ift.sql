-- WhatsApp y campañas (entrega 3)
--
-- 1. Plan de numeración del IFT: cada bloque de números es de teléfono fijo o
--    de celular (en México un número solo se porta de fijo a fijo o de celular
--    a celular). Un contacto sin verificar cuyo número es fijo queda «Fijo» y
--    no entra a las campañas. La evidencia de WhatsApp siempre gana. Los rangos
--    los carga scripts/ift-numbering.mjs (se recarga a mano cada 3 meses).
-- 2. Bandeja: los chats de números sin WhatsApp (Meta respondió 131026 y nunca
--    hubo respuesta ni entrega) se ocultan sin borrar nada. Si la persona
--    escribe, vuelven; si se busca su número, aparecen.

-- ── 1. Plan de numeración ───────────────────────────────────────────────────
create table public.ift_numbering (
  range_start bigint primary key check (range_start between 1000000000 and 9999999999),
  range_end   bigint not null check (range_end >= range_start and range_end <= 9999999999),
  kind        text not null check (kind in ('fijo', 'movil'))
);
alter table public.ift_numbering enable row level security;
revoke all on public.ift_numbering from public, anon, authenticated;
grant select, insert, update, delete on public.ift_numbering to service_role;

-- 'fijo' o 'movil' según el plan; null si no está en el plan o no es un número de 10 dígitos
create or replace function public.ift_kind(p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select i.kind
  from (select case when d ~ '^[1-9][0-9]{9}$' then d::bigint end as v
        from (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as d) x) n
  cross join lateral (
    select r.range_end, r.kind from public.ift_numbering r
    where r.range_start <= n.v
    order by r.range_start desc
    limit 1
  ) i
  where i.range_end >= n.v
$$;
revoke all on function public.ift_kind(text) from public, anon, authenticated;
grant execute on function public.ift_kind(text) to service_role;

-- ¿Ese número ya habló por WhatsApp con la tienda (escribió o le llegó un mensaje)?
create or replace function public.phone_has_whatsapp(p_store uuid, p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.whatsapp_messages m
    where m.store_id = p_store and m.phone in (p_phone, right(p_phone, 10))
      and (m.direction = 'inbound' or m.status in ('delivered', 'read')))
$$;
revoke all on function public.phone_has_whatsapp(uuid, text) from public, anon, authenticated;
grant execute on function public.phone_has_whatsapp(uuid, text) to service_role;

-- Al crear un contacto o cambiar su teléfono, si nadie eligió el tipo de línea:
-- con evidencia es «WhatsApp»; si no, y el plan dice fijo, «Fijo».
create or replace function public.contacts_line_type_on_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is null or new.line_type is not null then return new; end if;
  if public.phone_has_whatsapp(new.store_id, new.phone) then
    new.line_type := 'whatsapp';
  elsif public.ift_kind(new.phone) = 'fijo' then
    new.line_type := 'fijo';
  end if;
  return new;
end $$;
revoke all on function public.contacts_line_type_on_phone() from public, anon, authenticated;

create trigger contacts_line_type_on_phone
  before insert or update of phone on public.contacts
  for each row execute function public.contacts_line_type_on_phone();

-- Reemplaza el plan completo (lo llama el script) y marca «Fijo» a los contactos
-- sin verificar cuyo número es fijo. No toca updated_at: no es actividad de la tienda.
create or replace function public.replace_ift_numbering(p_ranges jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ranges integer;
  v_fixed  integer;
begin
  if jsonb_typeof(p_ranges) is distinct from 'array' or jsonb_array_length(p_ranges) < 1000 then
    raise exception 'El plan llegó vacío o incompleto' using errcode = 'P0001';
  end if;
  delete from public.ift_numbering where true;
  insert into public.ift_numbering (range_start, range_end, kind)
  select (r->>0)::bigint, (r->>1)::bigint, case r->>2 when 'f' then 'fijo' else 'movil' end
  from jsonb_array_elements(p_ranges) r;
  get diagnostics v_ranges = row_count;

  update public.contacts c set line_type = 'fijo'
  where c.line_type is null and c.phone is not null
    and public.ift_kind(c.phone) = 'fijo'
    and not public.phone_has_whatsapp(c.store_id, c.phone);
  get diagnostics v_fixed = row_count;
  return jsonb_build_object('rangos', v_ranges, 'contactos_fijos', v_fixed);
end $$;
revoke all on function public.replace_ift_numbering(jsonb) from public, anon, authenticated;
grant execute on function public.replace_ift_numbering(jsonb) to service_role;

-- ── 2. Bandeja sin los chats de números sin WhatsApp ───────────────────────
alter table public.whatsapp_thread_state add column no_whatsapp boolean not null default false;

-- Igual que antes, más no_whatsapp (con los mensajes del número actual)
create or replace function public.refresh_whatsapp_threads(p_store uuid[], p_phone text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k record;
begin
  for k in
    select distinct s, p from unnest(p_store, p_phone) as x(s, p) where s is not null and p is not null order by s, p
  loop
    perform pg_advisory_xact_lock(hashtextextended(k.s::text || ':' || k.p, 0));
  end loop;

  delete from public.whatsapp_thread_state t
  using unnest(p_store, p_phone) as x(s, p)
  where t.store_id = x.s and t.phone = x.p
    and not exists (select 1 from public.whatsapp_messages m
                    where m.store_id = x.s and m.phone = x.p and m.archived_number is null);

  insert into public.whatsapp_thread_state as t (
    store_id, phone, last_body, last_direction, last_status, last_media_type, last_template,
    last_at, unread, last_inbound_at, profile_name, contact_id, no_whatsapp)
  select x.s, x.p, l.body, l.direction, l.status, l.media_type, l.template_name, l.created_at,
    (select count(*)::integer from public.whatsapp_messages u
      where u.store_id = x.s and u.phone = x.p and u.archived_number is null
        and u.direction = 'inbound' and u.read_at is null),
    (select max(i.created_at) from public.whatsapp_messages i
      where i.store_id = x.s and i.phone = x.p and i.archived_number is null and i.direction = 'inbound'),
    (select pn.profile_name from public.whatsapp_messages pn
      where pn.store_id = x.s and pn.phone = x.p and pn.archived_number is null and pn.profile_name is not null
      order by pn.created_at desc, pn.id desc limit 1),
    (select c.contact_id from public.whatsapp_messages c
      where c.store_id = x.s and c.phone = x.p and c.archived_number is null and c.contact_id is not null
      order by c.created_at desc, c.id desc limit 1),
    -- Sin WhatsApp: Meta lo rechazó (131026) y nunca hubo respuesta ni entrega
    (not exists (select 1 from public.whatsapp_messages e
       where e.store_id = x.s and e.phone = x.p and e.archived_number is null
         and (e.direction = 'inbound' or e.status in ('delivered', 'read')))
     and exists (select 1 from public.whatsapp_messages f
       where f.store_id = x.s and f.phone = x.p and f.archived_number is null and f.error_code = 131026))
  from (select distinct s, p from unnest(p_store, p_phone) as y(s, p) where s is not null and p is not null) x
  cross join lateral (
    select m.body, m.direction, m.status, m.media_type, m.template_name, m.created_at
    from public.whatsapp_messages m
    where m.store_id = x.s and m.phone = x.p and m.archived_number is null
    order by m.created_at desc, m.id desc
    limit 1
  ) l
  on conflict (store_id, phone) do update set
    last_body = excluded.last_body, last_direction = excluded.last_direction,
    last_status = excluded.last_status, last_media_type = excluded.last_media_type,
    last_template = excluded.last_template, last_at = excluded.last_at, unread = excluded.unread,
    last_inbound_at = excluded.last_inbound_at, profile_name = excluded.profile_name,
    contact_id = excluded.contact_id, no_whatsapp = excluded.no_whatsapp;
end;
$$;
revoke all on function public.refresh_whatsapp_threads(uuid[], text[]) from public, anon, authenticated;

-- Los chats que ya existen
update public.whatsapp_thread_state t set no_whatsapp = (
  not exists (select 1 from public.whatsapp_messages e
    where e.store_id = t.store_id and e.phone = t.phone and e.archived_number is null
      and (e.direction = 'inbound' or e.status in ('delivered', 'read')))
  and exists (select 1 from public.whatsapp_messages f
    where f.store_id = t.store_id and f.phone = t.phone and f.archived_number is null and f.error_code = 131026))
where true;

-- La vista conserva sus columnas y agrega no_whatsapp al final
create or replace view public.whatsapp_threads as
select phone, last_body, last_direction, last_status, last_media_type, last_template,
       last_at, unread, last_inbound_at, profile_name, contact_id, store_id, no_whatsapp
from public.whatsapp_thread_state;

-- Igual que antes; sin buscar, no muestra los chats de números sin WhatsApp
create or replace function public.whatsapp_thread_list(
  p_store uuid,
  p_unread boolean default false,
  p_unknown boolean default false,
  p_words text[] default '{}',
  p_digits text default null,
  p_before timestamptz default null,
  p_limit integer default 101
)
returns setof public.whatsapp_threads
language sql
stable
set search_path to ''
as $function$
  select t.*
  from public.whatsapp_threads t
  left join lateral (
    select c.id, c.search_text
    from public.contacts c
    where c.store_id = t.store_id
      and (c.id = t.contact_id or c.phone in (t.phone, '52' || t.phone, '521' || t.phone))
    order by (c.id = t.contact_id) desc nulls last
    limit 1
  ) c on true
  where t.store_id = p_store
    and (not t.no_whatsapp or p_digits is not null or cardinality(coalesce(p_words, '{}'::text[])) > 0)
    and (not coalesce(p_unread, false) or t.unread > 0)
    and (not coalesce(p_unknown, false) or c.id is null)
    and (p_before is null or t.last_at < p_before)
    and (p_digits is null or t.phone like '%' || p_digits || '%')
    and not exists (
      select 1 from unnest(coalesce(p_words, '{}'::text[])) w
      where (coalesce(c.search_text, '') || ' '
             || translate(lower(coalesce(t.profile_name, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou') || ' '
             || t.phone) not like '%' || w || '%'
    )
  order by t.last_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 1001))
$function$;
revoke all on function public.whatsapp_thread_list(uuid, boolean, boolean, text[], text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.whatsapp_thread_list(uuid, boolean, boolean, text[], text, timestamptz, integer) to service_role;
