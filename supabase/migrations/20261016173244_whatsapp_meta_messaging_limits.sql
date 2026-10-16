-- Reglas de envío de plantillas según la documentación oficial de Meta
-- (developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits):
--  · El límite cuenta PERSONAS ÚNICAS contactadas FUERA de la ventana de
--    atención (24 h desde su último mensaje) en 24 h móviles; el tope es el
--    nivel del portafolio en Meta (250, 2,000, 10,000, 100,000 o ilimitado).
--  · Error 131049 (límite de marketing por persona): esperar al menos 24 h
--    antes de reenviarle una plantilla de marketing.

alter table public.whatsapp_messages
  add column if not exists error_code integer,
  add column if not exists outside_window boolean;

-- Códigos de los fallos ya guardados (antes solo se guardaba el texto traducido)
update public.whatsapp_messages set error_code = 131049
  where status = 'failed' and error_code is null
    and (error_message like 'Meta no entregó esta plantilla para cuidar la experiencia del usuario%'
         or error_message ilike '%healthy ecosystem engagement%');
update public.whatsapp_messages set error_code = 131026
  where status = 'failed' and error_code is null
    and (error_message like 'El mensaje no se pudo entregar (el número no tiene WhatsApp%'
         or error_message ilike 'message undeliverable%');

create or replace function public.reserve_whatsapp_template(
  p_store uuid, p_actor uuid, p_phone text, p_template text, p_body text,
  p_contact uuid, p_limit integer, p_marketing boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.stores%rowtype;
  message_id uuid;
  used_count integer;
  is_outside boolean;
begin
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.store_members where store_id = p_store and user_id = p_actor
                 and status = 'active' and role in ('owner','admin')) then
    raise exception 'Sin permisos para enviar plantillas' using errcode = 'P0001';
  end if;
  if not coalesce((s.modules ->> 'whatsapp')::boolean, false) then
    raise exception 'WhatsApp desactivado' using errcode = 'P0001';
  end if;
  if not coalesce((s.status = 'active' and (s.paid_until is null or s.paid_until + interval '3 days' > now()))
      or (s.status = 'trial' and s.trial_ends_at > now()), false) then
    raise exception 'La tienda está en modo solo lectura' using errcode = 'P0001';
  end if;
  -- p_limit null = nivel ilimitado de Meta
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$' or p_template is null or length(p_template) > 512 or p_template !~ '^[a-z0-9_]+$'
     or (p_limit is not null and (p_limit < 1 or p_limit > 1000000)) then
    raise exception 'Datos de envío inválidos' using errcode = 'P0001';
  end if;
  if p_contact is not null and not exists (select 1 from public.contacts where id = p_contact and store_id = p_store and phone = p_phone) then
    raise exception 'Contacto no encontrado' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.contacts where store_id = p_store and wa_opt_out
             and (id = p_contact or phone = p_phone)) then
    return jsonb_build_object('allowed', false, 'reason', 'opt_out');
  end if;
  if coalesce(p_marketing, true) and exists (select 1 from public.whatsapp_messages
      where store_id = p_store and phone = p_phone and direction = 'outbound' and error_code = 131049
        and updated_at >= now() - interval '24 hours') then
    return jsonb_build_object('allowed', false, 'reason', 'marketing_limit');
  end if;

  -- Ventana de atención abierta: la plantilla no cuenta para el límite de Meta
  is_outside := not exists (select 1 from public.whatsapp_messages
    where store_id = p_store and phone = p_phone and direction = 'inbound'
      and created_at >= now() - interval '24 hours');

  -- Personas únicas ya contactadas fuera de la ventana; quien ya está en la
  -- lista no ocupa un lugar nuevo. Los envíos previos a esta regla cuentan.
  if is_outside and p_limit is not null and not exists (select 1 from public.whatsapp_messages
      where store_id = p_store and phone = p_phone and direction = 'outbound' and template_name is not null
        and status <> 'failed' and coalesce(outside_window, true) and created_at >= now() - interval '24 hours') then
    select count(distinct phone) into used_count from public.whatsapp_messages
      where store_id = p_store and direction = 'outbound' and template_name is not null
        and status <> 'failed' and coalesce(outside_window, true) and created_at >= now() - interval '24 hours';
    if used_count >= p_limit then return jsonb_build_object('allowed', false, 'reason', 'quota'); end if;
  end if;

  insert into public.whatsapp_messages (store_id, user_id, contact_id, phone, direction, template_name, body, status, outside_window)
    values (p_store, p_actor, p_contact, p_phone, 'outbound', p_template, left(p_body, 4096), 'pending', is_outside)
    returning id into message_id;
  return jsonb_build_object('allowed', true, 'id', message_id);
end $$;
revoke all on function public.reserve_whatsapp_template(uuid,uuid,text,text,text,uuid,integer,boolean) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_template(uuid,uuid,text,text,text,uuid,integer,boolean) to service_role;

-- La versión anterior (tope fijo de 200 y regla de 7 días) se elimina en una
-- migración aparte, después de desplegar el código que usa esta.
