-- Chats de un número anterior.
-- Los mensajes se guardaban solo por tienda y teléfono del cliente, sin el número
-- de la tienda: al conectar otro número, la bandeja seguía mostrando los chats del
-- anterior. Ahora, al cambiar de número, los mensajes viejos se marcan con
-- archived_number (no se borran) y la bandeja solo usa los del número actual.

alter table public.whatsapp_messages add column if not exists archived_number text;

-- Al desconectar se recuerda el número, para saber al reconectar si es otro.
alter table public.store_whatsapp add column if not exists previous_phone_number_id text;
alter table public.store_whatsapp add column if not exists previous_display_phone text;

-- Las conversaciones (whatsapp_thread_state) se calculan solo con mensajes del número actual.
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
    last_at, unread, last_inbound_at, profile_name, contact_id)
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
      order by c.created_at desc, c.id desc limit 1)
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
    contact_id = excluded.contact_id;
end;
$$;

revoke all on function public.refresh_whatsapp_threads(uuid[], text[]) from public, anon, authenticated;

-- Mensajes que WhatsApp no deja ver (historial con type "errors" / "unsupported").
update public.whatsapp_messages
   set body = 'Mensaje que WhatsApp no permite ver aquí'
 where body in ('[errors]', '[unsupported]');
