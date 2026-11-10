-- reserve_whatsapp_template: el contacto se valida con su teléfono normalizado
-- (últimos 10 dígitos). Antes comparaba el texto guardado tal cual, así que un
-- contacto con "52…", 11 dígitos o un carácter invisible daba "Contacto no
-- encontrado" y, en campañas, tumbaba el lote completo.
CREATE OR REPLACE FUNCTION public.reserve_whatsapp_template(p_store uuid, p_actor uuid, p_phone text, p_template text, p_body text, p_contact uuid, p_limit integer, p_marketing boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.stores%rowtype;
  message_id uuid;
  used_count integer;
  is_outside boolean;
begin
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.store_members where store_id = p_store and user_id = p_actor
                 and status = 'active' and role = 'admin') then
    raise exception 'Sin permisos para enviar plantillas' using errcode = 'P0001';
  end if;
  if not coalesce((s.modules ->> 'whatsapp')::boolean, false) then
    raise exception 'WhatsApp desactivado' using errcode = 'P0001';
  end if;
  if s.status in ('suspended', 'cancelled') then
    raise exception 'La tienda está en modo solo lectura' using errcode = 'P0001';
  end if;
  if public.store_effective_plan(s.plan, s.paid_until) not in ('cubeta', 'interno') then
    raise exception 'WhatsApp está incluido solo en el plan Cubeta' using errcode = 'P0001';
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$' or p_template is null or length(p_template) > 512 or p_template !~ '^[a-z0-9_]+$'
     or (p_limit is not null and (p_limit < 1 or p_limit > 1000000)) then
    raise exception 'Datos de envío inválidos' using errcode = 'P0001';
  end if;
  if p_contact is not null and not exists (select 1 from public.contacts where id = p_contact and store_id = p_store
      and (phone = p_phone or right(regexp_replace(phone, '\D', '', 'g'), 10) = right(p_phone, 10))) then
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
  is_outside := not exists (select 1 from public.whatsapp_messages
    where store_id = p_store and phone = p_phone and direction = 'inbound'
      and created_at >= now() - interval '24 hours');
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
end $function$;
