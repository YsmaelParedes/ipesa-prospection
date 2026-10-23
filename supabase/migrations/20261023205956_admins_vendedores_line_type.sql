-- Solo administradores y vendedores (adiós al rol "dueño" y al panel de la plataforma)
-- y Contactos ligero: tipo de línea (WhatsApp / fijo), búsqueda sin acentos y conteos
-- para los filtros sin bajar toda la base.

-- ── 1. Roles: el dueño pasa a administrador ─────────────────────────────────
-- Las invitaciones de dueño las emitía el panel de la plataforma, que ya no existe.
update public.store_invitations set revoked_at = now()
  where role = 'owner' and accepted_at is null and revoked_at is null;
update public.store_invitations set role = 'admin' where role = 'owner';
update public.store_members set role = 'admin' where role = 'owner';

alter table public.store_members drop constraint store_members_role_check;
alter table public.store_members add constraint store_members_role_check check (role in ('admin', 'employee'));
alter table public.store_invitations drop constraint store_invitations_role_check;
alter table public.store_invitations add constraint store_invitations_role_check check (role in ('admin', 'employee'));

-- Aceptar invitación: la emite un administrador activo. Un plan sin "allowAdmins"
-- tiene un solo administrador (quien abrió la tienda), así que solo invita vendedores.
create or replace function public.accept_store_invitation(p_invitation uuid, p_user uuid, p_plans jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  select * into s from public.stores where id = inv.store_id for update;
  if not found then raise exception 'Esta invitación no existe' using errcode = 'P0002'; end if;
  select * into inv from public.store_invitations where id = p_invitation for update;
  if inv.revoked_at is not null then raise exception 'La invitación fue cancelada.' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'Esta invitación ya se usó.' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'La invitación venció. Pide una nueva.' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_user and lower(email) = lower(inv.email)
                  and email_confirmed_at is not null) then
    raise exception 'Confirma el correo invitado antes de aceptar.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.store_members where store_id = inv.store_id
      and user_id = inv.invited_by and status = 'active' and role = 'admin') then
    raise exception 'La invitación ya no tiene un emisor autorizado.' using errcode = 'P0001';
  end if;
  v_plan := coalesce(p_plans -> public.store_effective_plan(s.plan, s.paid_until), p_plans -> 'litro');
  v_max  := coalesce((v_plan ->> 'maxUsers')::integer, 1);
  if inv.role = 'admin' and not coalesce((v_plan ->> 'allowAdmins')::boolean, false) then
    raise exception 'El plan de la tienda ya no permite más administradores. Pide una invitación como vendedor.' using errcode = 'P0001';
  end if;
  select * into v_existing from public.store_members where store_id = s.id and user_id = p_user;
  if found and v_existing.status <> 'active' then
    raise exception 'Tu acceso está desactivado. Pide a un administrador que lo reactive.' using errcode = 'P0001';
  end if;
  if v_existing.user_id is null then
    select count(*) into v_seats from public.store_members where store_id = s.id and status = 'active';
    if v_seats >= v_max then
      raise exception 'El equipo de esta tienda ya está completo. Pide a un administrador que libere un lugar o cambie de plan.' using errcode = 'P0001';
    end if;
    insert into public.store_members (store_id, user_id, role, status) values (s.id, p_user, inv.role, 'active');
  end if;
  update public.store_invitations set accepted_at = now(), accepted_by = p_user where id = inv.id;
  return jsonb_build_object('store_id', s.id, 'already_member', v_existing.user_id is not null);
end $function$;

-- Equipo: un administrador maneja a todos menos a sí mismo. Nombrar o reactivar
-- a otro administrador requiere un plan con "allowAdmins".
create or replace function public.manage_store_member(p_store uuid, p_actor uuid, p_target uuid, p_role text, p_status text, p_remove boolean, p_plans jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if not found or actor.role <> 'admin' then
    raise exception 'Sin permisos para administrar el equipo' using errcode = 'P0001';
  end if;
  select * into target from public.store_members where store_id = p_store and user_id = p_target for update;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_target = p_actor then
    raise exception 'No puedes cambiar tu propio acceso' using errcode = 'P0001';
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
    limits := coalesce(p_plans -> public.store_effective_plan(s.plan, s.paid_until), p_plans -> 'litro');
    if p_role = 'admin' and target.role <> 'admin' and not coalesce((limits ->> 'allowAdmins')::boolean, false) then
      raise exception 'Tu plan incluye un solo administrador' using errcode = 'P0001';
    end if;
    if p_status = 'active' and target.status <> 'active' then
      if coalesce(p_role, target.role) = 'admin' and not coalesce((limits ->> 'allowAdmins')::boolean, false) then
        raise exception 'Tu plan incluye un solo administrador' using errcode = 'P0001';
      end if;
      select (select count(*) from public.store_members where store_id = p_store and status = 'active')
        + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
           and revoked_at is null and expires_at > now()) into seats;
      if seats >= coalesce((limits ->> 'maxUsers')::integer, 1) then
        raise exception 'El equipo está completo para tu plan, contando invitaciones pendientes. Libera un lugar o cambia de plan.' using errcode = 'P0001';
      end if;
    end if;
    update public.store_members set role = coalesce(p_role, role), status = coalesce(p_status, status)
      where store_id = p_store and user_id = p_target;
  end if;
  if coalesce(p_remove, false) or p_status = 'disabled' or (target.role = 'admin' and p_role = 'employee') then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and invited_by = p_target and accepted_at is null and revoked_at is null;
  end if;
end $function$;

-- Plantillas de WhatsApp: solo administradores
create or replace function public.reserve_whatsapp_template(p_store uuid, p_actor uuid, p_phone text, p_template text, p_body text, p_contact uuid, p_limit integer, p_marketing boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

-- Cambio de plan con Stripe: sin "allowAdmins" queda un solo administrador (el
-- más antiguo) y, si sobra gente, se desactiva a los más nuevos; el
-- administrador más antiguo nunca se desactiva.
create or replace function public.apply_stripe_subscription(p_store uuid, p_customer text, p_subscription text, p_status text, p_plan text, p_period_end timestamp with time zone, p_cancel_at_period_end boolean, p_plans jsonb, p_lock uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  s public.stores%rowtype;
  v_paid boolean := p_status in ('active', 'trialing', 'past_due');
  v_ended boolean := p_status in ('canceled', 'unpaid', 'incomplete_expired', 'paused');
  v_plan text;
  v_prev text;
  v_limits jsonb;
  v_max integer;
  v_disabled integer := 0;
  v_demoted integer := 0;
  v_first uuid;
begin
  perform public.assert_stripe_store_lock(p_store, p_lock);
  if p_customer is null or p_subscription is null or p_status is null then
    raise exception 'Datos de suscripción incompletos' using errcode = 'P0001';
  end if;
  if v_paid and (p_plan is null or p_plan not in ('galon', 'cubeta')) then
    raise exception 'Plan de Stripe desconocido' using errcode = 'P0001';
  end if;
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  if s.stripe_customer_id is not null and s.stripe_customer_id <> p_customer then
    raise exception 'El cliente de Stripe no corresponde a la tienda' using errcode = 'P0001';
  end if;
  if s.stripe_subscription_id is not null and s.stripe_subscription_id <> p_subscription
     and coalesce(s.subscription_status, '') in ('active', 'trialing', 'past_due') and not v_paid then
    return jsonb_build_object('ignored', true);
  end if;
  v_prev := public.store_effective_plan(s.plan, s.paid_until);
  v_plan := case
    when v_paid then p_plan
    when v_ended and s.plan = 'interno' then 'interno'
    when v_ended then 'litro'
    else s.plan
  end;
  update public.stores set
    stripe_customer_id = p_customer, stripe_subscription_id = p_subscription,
    subscription_status = left(p_status, 40), current_period_end = p_period_end,
    cancel_at_period_end = coalesce(p_cancel_at_period_end, false), plan = v_plan,
    -- Use the existing 3-day grace calculation in both SQL and TypeScript.
    -- Repeated failures MUST NOT restart the grace period.
    paid_until = case
      when p_status = 'past_due' then case
        when s.subscription_status = 'past_due' then coalesce(s.paid_until, now()) else now() end
      when v_paid then null else paid_until end,
    status = case when status in ('pending', 'trial') then 'active' else status end,
    updated_at = now()
    where id = p_store;
  if v_plan <> 'litro' then
    v_limits := coalesce(p_plans -> v_plan, p_plans -> 'litro');
    v_max := coalesce((v_limits ->> 'maxUsers')::integer, 1);
    select user_id into v_first from public.store_members
      where store_id = p_store and status = 'active' and role = 'admin'
      order by created_at asc, user_id limit 1;
    if not coalesce((v_limits ->> 'allowAdmins')::boolean, false) then
      update public.store_members set role = 'employee'
        where store_id = p_store and role = 'admin' and user_id is distinct from v_first;
      get diagnostics v_demoted = row_count;
    end if;
    with ranked as (
      select user_id, row_number() over (order by (user_id = v_first) desc nulls last, created_at asc, user_id) as rn
      from public.store_members where store_id = p_store and status = 'active'
    )
    update public.store_members m set status = 'disabled'
      from ranked r where m.store_id = p_store and m.user_id = r.user_id and r.rn > v_max
        and m.user_id is distinct from v_first;
    get diagnostics v_disabled = row_count;
  end if;
  if v_plan is distinct from v_prev
     and (select count(*) from public.store_members where store_id = p_store and status = 'active')
       + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
          and revoked_at is null and expires_at > now())
       > coalesce((coalesce(p_plans -> v_plan, p_plans -> 'litro') ->> 'maxUsers')::integer, 1) then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and accepted_at is null and revoked_at is null;
  end if;
  insert into public.platform_events(store_id, actor_id, action, detail)
    values (p_store, null, 'stripe_subscription', jsonb_build_object(
      'status', p_status, 'plan', v_plan, 'prev_plan', v_prev, 'subscription', p_subscription,
      'disabled_members', v_disabled, 'demoted_admins', v_demoted));
  return jsonb_build_object('plan', v_plan, 'prev_plan', v_prev,
    'disabled_members', v_disabled, 'demoted_admins', v_demoted);
end $function$;

-- Retención: los avisos van a los administradores de la tienda
drop function public.store_retention_status(integer);
create function public.store_retention_status(p_idle_days integer)
 returns table(id uuid, name text, slug text, last_used_at timestamp with time zone, idle boolean, protected boolean, deletion_scheduled_for timestamp with time zone, deletion_notices smallint, admin_emails text[])
 language sql
 stable security definer
 set search_path to ''
as $function$
  select s.id, s.name, s.slug, l.at,
         l.at < now() - make_interval(days => p_idle_days),
         public.store_retention_protected(s),
         s.deletion_scheduled_for, s.deletion_notices,
         array(select u.email::text from public.store_members m join auth.users u on u.id = m.user_id
               where m.store_id = s.id and m.role = 'admin' and m.status = 'active' and u.email is not null)
  from public.stores s
  cross join lateral (select public.store_last_used_at(s.id) as at) l
$function$;
revoke all on function public.store_retention_status(integer) from public, anon, authenticated;
grant execute on function public.store_retention_status(integer) to service_role;

-- El resumen de tiendas era del panel de la plataforma
drop function if exists public.platform_store_overview();

-- ── 2. Contactos: tipo de línea ─────────────────────────────────────────────
-- null = sin verificar. 'whatsapp' si escribió o le llegó un mensaje; 'fijo' si
-- Meta dijo que no tiene WhatsApp (131026). El vendedor también lo marca a mano.
alter table public.contacts add column line_type text
  constraint contacts_line_type_check check (line_type in ('whatsapp', 'fijo'));

update public.contacts c set line_type = ev.kind
from (
  select store_id, phone,
         case when bool_or(direction = 'inbound' or status in ('delivered', 'read')) then 'whatsapp'
              when bool_or(error_code = 131026) then 'fijo' end as kind
  from public.whatsapp_messages group by store_id, phone
) ev
where ev.store_id = c.store_id and ev.phone = c.phone and ev.kind is not null;

-- Cada mensaje nuevo o cambio de estado lo actualiza solo. Evidencia de WhatsApp
-- siempre gana; "sin WhatsApp" solo se pone si nadie lo había verificado.
create or replace function public.contacts_line_type_from_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.direction = 'inbound' or new.status in ('delivered', 'read') then
    update public.contacts set line_type = 'whatsapp'
      where store_id = new.store_id and phone = new.phone and line_type is distinct from 'whatsapp';
  elsif new.error_code = 131026 then
    update public.contacts set line_type = 'fijo'
      where store_id = new.store_id and phone = new.phone and line_type is null;
  end if;
  return null;
end $function$;
revoke all on function public.contacts_line_type_from_message() from public, anon, authenticated;

create trigger whatsapp_messages_line_type
  after insert or update of status, error_code on public.whatsapp_messages
  for each row
  when (new.direction = 'inbound' or new.status in ('delivered', 'read') or new.error_code = 131026)
  execute function public.contacts_line_type_from_message();

-- ── 3. Contactos: búsqueda sin acentos y conteos para los filtros ───────────
alter table public.contacts add column search_text text generated always as (
  translate(lower(coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(email, '') || ' '
    || coalesce(segment, '') || ' ' || coalesce(acquisition_channel, '') || ' ' || coalesce(zone, '')),
    'áéíóúüñàèìòù', 'aeiouunaeiou')
) stored;

-- Conteos por segmento, canal, zona y teléfono de toda la base (una sola pasada)
create or replace function public.contact_facets(p_store uuid)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select jsonb_build_object(
    'total', count(*),
    'segment', coalesce((select jsonb_object_agg(k, n) from (select segment k, count(*) n from public.contacts
      where store_id = p_store and segment is not null and segment <> '' group by 1) x), '{}'::jsonb),
    'channel', coalesce((select jsonb_object_agg(k, n) from (select acquisition_channel k, count(*) n from public.contacts
      where store_id = p_store and acquisition_channel is not null and acquisition_channel <> '' group by 1) x), '{}'::jsonb),
    'zone', coalesce((select jsonb_object_agg(k, n) from (select zone k, count(*) n from public.contacts
      where store_id = p_store and zone is not null and zone <> '' group by 1) x), '{}'::jsonb),
    'line', jsonb_build_object(
      'whatsapp', count(*) filter (where phone is not null and line_type = 'whatsapp'),
      'fijo', count(*) filter (where phone is not null and line_type = 'fijo'),
      'sin_verificar', count(*) filter (where phone is not null and line_type is null),
      'sin_telefono', count(*) filter (where phone is null))
  )
  from public.contacts where store_id = p_store
$function$;
revoke all on function public.contact_facets(uuid) from public, anon, authenticated;
grant execute on function public.contact_facets(uuid) to service_role;
