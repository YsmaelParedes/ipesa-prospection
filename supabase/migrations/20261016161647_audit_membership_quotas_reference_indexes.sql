create or replace function public.accept_store_invitation(p_invitation uuid, p_user uuid, p_plans jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv   public.store_invitations%rowtype;
  s     public.stores%rowtype;
  v_plan jsonb;
  v_max  integer;
  v_seats integer;
  v_existing public.store_members%rowtype;
begin
  select * into inv from public.store_invitations where id = p_invitation;
  if not found then raise exception 'Esta invitación no existe' using errcode = 'P0002'; end if;

  -- Mismo orden de bloqueo que record/void_store_payment: primero la tienda
  select * into s from public.stores where id = inv.store_id for update;
  if not found then raise exception 'Esta invitación no existe' using errcode = 'P0002'; end if;
  select * into inv from public.store_invitations where id = p_invitation for update;

  if inv.revoked_at is not null then raise exception 'La invitación fue cancelada.' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'Esta invitación ya se usó.' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'La invitación venció. Pide una nueva.' using errcode = 'P0001'; end if;

  -- Bind acceptance to the currently verified email and current issuer authority.
  if not exists (select 1 from auth.users where id = p_user and lower(email) = lower(inv.email)
                  and email_confirmed_at is not null) then
    raise exception 'Confirma el correo invitado antes de aceptar.' using errcode = 'P0001';
  end if;
  if inv.role = 'owner' then
    if not exists (select 1 from public.platform_admins where user_id = inv.invited_by) then
      raise exception 'La invitación ya no tiene un emisor autorizado.' using errcode = 'P0001';
    end if;
  elsif not exists (select 1 from public.store_members where store_id = inv.store_id
      and user_id = inv.invited_by and status = 'active'
      and (role = 'owner' or (role = 'admin' and inv.role = 'employee'))) then
    raise exception 'La invitación ya no tiene un emisor autorizado.' using errcode = 'P0001';
  end if;

  v_plan := coalesce(p_plans -> s.plan, p_plans -> 'profesional');
  v_max  := coalesce((v_plan ->> 'maxUsers')::integer, 3);

  if inv.role = 'admin' and not coalesce((v_plan ->> 'allowAdmins')::boolean, false) then
    raise exception 'El plan de la tienda ya no permite administradores. Pide una invitación como vendedor.' using errcode = 'P0001';
  end if;
  if inv.role = 'owner' and exists (
    select 1 from public.store_members
     where store_id = s.id and role = 'owner' and status = 'active' and user_id <> p_user
  ) then
    raise exception 'Esta tienda ya tiene dueño.' using errcode = 'P0001';
  end if;

  select * into v_existing from public.store_members where store_id = s.id and user_id = p_user;
  if found and v_existing.status <> 'active' then
    raise exception 'Tu acceso está desactivado. Pide al dueño que lo reactive.' using errcode = 'P0001';
  end if;
  if v_existing.user_id is null then
    select count(*) into v_seats from public.store_members where store_id = s.id and status = 'active';
    if v_seats >= v_max then
      raise exception 'El equipo de esta tienda ya está completo. Pide al dueño que libere un lugar.' using errcode = 'P0001';
    end if;
    insert into public.store_members (store_id, user_id, role, status) values (s.id, p_user, inv.role, 'active');
  end if;
  -- Si ya era miembro (activo o desactivado) se respeta lo que decidió el dueño

  update public.store_invitations set accepted_at = now(), accepted_by = p_user where id = inv.id;
  return jsonb_build_object('store_id', s.id, 'already_member', v_existing.user_id is not null);
end $$;

revoke all on function public.accept_store_invitation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.accept_store_invitation(uuid, uuid, jsonb) to service_role;


-- Serialize membership changes with invitation acceptance on the same store.
create or replace function public.manage_store_member(
  p_store uuid, p_actor uuid, p_target uuid, p_role text, p_status text,
  p_remove boolean, p_plans jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.stores%rowtype;
  actor public.store_members%rowtype;
  target public.store_members%rowtype;
  limits jsonb;
  seats integer;
begin
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  select * into actor from public.store_members where store_id = p_store and user_id = p_actor and status = 'active';
  if not found or actor.role not in ('owner', 'admin') then
    raise exception 'Sin permisos para administrar el equipo' using errcode = 'P0001';
  end if;
  select * into target from public.store_members where store_id = p_store and user_id = p_target for update;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_target = p_actor or target.role = 'owner' or (actor.role <> 'owner' and target.role <> 'employee') then
    raise exception 'No puedes cambiar el acceso de este usuario' using errcode = 'P0001';
  end if;
  if p_role is not null and p_role not in ('admin', 'employee') then
    raise exception 'Rol inválido' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('active', 'disabled') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;
  if coalesce(p_remove, false) then
    delete from public.store_members where store_id = p_store and user_id = p_target;
  else
    limits := coalesce(p_plans -> s.plan, p_plans -> 'profesional');
    if p_role = 'admin' and (actor.role <> 'owner' or not coalesce((limits ->> 'allowAdmins')::boolean, false)) then
      raise exception 'El plan o tu rol no permite nombrar administradores' using errcode = 'P0001';
    end if;
    if p_status = 'active' and target.status <> 'active' then
      if coalesce(p_role, target.role) = 'admin' and not coalesce((limits ->> 'allowAdmins')::boolean, false) then
        raise exception 'El plan ya no permite administradores' using errcode = 'P0001';
      end if;
      select (select count(*) from public.store_members where store_id = p_store and status = 'active')
        + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
           and revoked_at is null and expires_at > now()) into seats;
      if seats >= coalesce((limits ->> 'maxUsers')::integer, 3) then
        raise exception 'El equipo está completo, contando invitaciones pendientes. Libera un lugar primero.' using errcode = 'P0001';
      end if;
    end if;
    update public.store_members set role = coalesce(p_role, role), status = coalesce(p_status, status)
      where store_id = p_store and user_id = p_target;
  end if;
  if coalesce(p_remove, false) or p_status = 'disabled' or (target.role = 'admin' and p_role = 'employee') then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and invited_by = p_target and accepted_at is null and revoked_at is null;
  end if;
end $$;
revoke all on function public.manage_store_member(uuid,uuid,uuid,text,text,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.manage_store_member(uuid,uuid,uuid,text,text,boolean,jsonb) to service_role;

-- Reserve a durable history row before calling Meta, so parallel requests share a quota.
create or replace function public.reserve_whatsapp_template(
  p_store uuid, p_actor uuid, p_phone text, p_template text, p_body text,
  p_contact uuid, p_limit integer, p_repeat_days integer, p_skip_recent boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.stores%rowtype;
  message_id uuid;
  sent_count integer;
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
  if p_phone is null or p_phone !~ '^[0-9]{10,15}$' or p_template is null or length(p_template) > 512 or p_template !~ '^[a-z0-9_]+$'
     or p_limit is null or p_limit < 1 or p_limit > 200
     or p_repeat_days is null or p_repeat_days < 1 or p_repeat_days > 365 then
    raise exception 'Datos de envío inválidos' using errcode = 'P0001';
  end if;
  if p_contact is not null and not exists (select 1 from public.contacts where id = p_contact and store_id = p_store and phone = p_phone) then
    raise exception 'Contacto no encontrado' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.contacts where store_id = p_store and wa_opt_out
             and (id = p_contact or phone = p_phone)) then
    return jsonb_build_object('allowed', false, 'reason', 'opt_out');
  end if;
  select count(*) into sent_count from public.whatsapp_messages
    where store_id = p_store and direction = 'outbound' and template_name is not null
      and status <> 'failed' and created_at >= now() - interval '24 hours';
  if sent_count >= p_limit then return jsonb_build_object('allowed', false, 'reason', 'quota'); end if;
  if coalesce(p_skip_recent, true) and exists (select 1 from public.whatsapp_messages
      where store_id = p_store and phone = p_phone and direction = 'outbound' and template_name = p_template
        and status <> 'failed' and created_at >= now() - make_interval(days => p_repeat_days)) then
    return jsonb_build_object('allowed', false, 'reason', 'recent');
  end if;
  insert into public.whatsapp_messages (store_id, user_id, contact_id, phone, direction, template_name, body, status)
    values (p_store, p_actor, p_contact, p_phone, 'outbound', p_template, left(p_body, 4096), 'pending') returning id into message_id;
  return jsonb_build_object('allowed', true, 'id', message_id);
end $$;
revoke all on function public.reserve_whatsapp_template(uuid,uuid,text,text,text,uuid,integer,integer,boolean) from public, anon, authenticated;
grant execute on function public.reserve_whatsapp_template(uuid,uuid,text,text,text,uuid,integer,integer,boolean) to service_role;

-- Cover composite tenant references and audit/user references reported by advisors.
create index if not exists lead_activities_store_lead_idx on public.lead_activities(store_id, lead_id);
create index if not exists leads_store_contact_idx on public.leads(store_id, contact_id);
create index if not exists reminders_store_lead_idx on public.reminders(store_id, lead_id);
create index if not exists whatsapp_messages_store_contact_idx on public.whatsapp_messages(store_id, contact_id);
create index if not exists platform_events_actor_idx on public.platform_events(actor_id);
create index if not exists store_invitations_accepted_by_idx on public.store_invitations(accepted_by);
create index if not exists store_invitations_invited_by_idx on public.store_invitations(invited_by);
create index if not exists store_payments_created_by_idx on public.store_payments(created_by);
create index if not exists store_payments_voided_by_idx on public.store_payments(voided_by);
create index if not exists stores_created_by_idx on public.stores(created_by);
