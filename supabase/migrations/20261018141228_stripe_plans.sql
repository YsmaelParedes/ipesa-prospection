-- ════════════════════════════════════════════════════════════════════════════
-- Planes Litro · Galón · Cubeta con suscripción mensual en Stripe (3.0.0)
--
--   · stores: datos de la suscripción de Stripe y plan con valores fijos
--     (litro gratis, galon, cubeta, interno = cortesía de la tienda propia).
--   · Plan efectivo (store_effective_plan): un plan de paga asignado a mano
--     cuyo paid_until venció (más 3 días de gracia) cuenta como Litro. Si el
--     plan viene de Stripe manda la suscripción (paid_until queda en null). Gemela en lib/stores.ts
--     (effectivePlan): si cambias una, cambia la otra.
--   · Límites de Litro (plan_quota): 50 contactos y 10 leads, con trigger
--     atómico por tienda. Los mismos números viven en PLANS (lib/stores.ts).
--   · apply_stripe_subscription: lo único que escribe la suscripción (webhook).
--   · WhatsApp e invitaciones usan el plan efectivo.
--   · stripe_events: cada aviso de Stripe se procesa una sola vez.
-- ════════════════════════════════════════════════════════════════════════════

set lock_timeout = '8s';

-- ── Tiendas ─────────────────────────────────────────────────────────────────
alter table public.stores
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status    text check (char_length(subscription_status) <= 40),
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false;

-- Ya no hay "Por activar" ni prueba gratis: toda tienda nueva entra en Litro
update public.stores set status = 'active', plan = 'litro', paid_until = null, trial_ends_at = null
  where status in ('pending', 'trial');
-- Profesional (pagado a mano) → Cubeta con la misma fecha: al vencer baja sola a Litro
update public.stores set plan = 'cubeta' where plan = 'profesional';
update public.stores set plan = 'litro' where plan not in ('litro', 'galon', 'cubeta', 'interno');

alter table public.stores alter column plan set default 'litro';
alter table public.stores alter column status set default 'active';
alter table public.stores add constraint stores_plan_check
  check (plan in ('litro', 'galon', 'cubeta', 'interno'));

-- ── Plan efectivo y límites ────────────────────────────────────────────────
-- Las suscripciones de Stripe dejan paid_until en null (la vigencia la lleva
-- Stripe), así que solo vence lo asignado a mano.
create or replace function public.store_effective_plan(p_plan text, p_paid_until timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_plan in ('galon', 'cubeta')
         and p_paid_until is not null and p_paid_until + interval '3 days' <= now() then 'litro'
    when p_plan in ('litro', 'galon', 'cubeta', 'interno') then p_plan
    else 'litro'
  end
$$;
revoke all on function public.store_effective_plan(text, timestamptz) from public, anon, authenticated;
grant execute on function public.store_effective_plan(text, timestamptz) to service_role;

-- null = sin límite. Mismos números que PLANS.litro en lib/stores.ts
create or replace function public.plan_quota(p_plan text, p_kind text)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_plan = 'litro' and p_kind = 'contacts' then 50
    when p_plan = 'litro' and p_kind = 'leads' then 10
    else null
  end
$$;
revoke all on function public.plan_quota(text, text) from public, anon, authenticated;
grant execute on function public.plan_quota(text, text) to service_role;

-- Antes de insertar un contacto o lead: bloquea por tienda, cuenta y rechaza
-- si el plan llegó a su límite (mensaje "PLAN_LIMIT:<tipo>:<límite>").
create or replace function public.enforce_plan_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind  text := tg_argv[0];
  v_plan  text;
  v_limit integer;
  v_count integer;
begin
  select public.store_effective_plan(plan, paid_until) into v_plan
    from public.stores where id = new.store_id;
  v_limit := public.plan_quota(v_plan, v_kind);
  if v_limit is null then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_quota:' || v_kind || ':' || new.store_id::text, 0));
  if v_kind = 'contacts' then
    select count(*) into v_count from public.contacts where store_id = new.store_id;
  else
    select count(*) into v_count from public.leads where store_id = new.store_id;
  end if;
  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT:%:%', v_kind, v_limit using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_plan_quota() from public, anon, authenticated;

create or replace trigger contacts_plan_quota before insert on public.contacts
  for each row execute function public.enforce_plan_quota('contacts');
create or replace trigger leads_plan_quota before insert on public.leads
  for each row execute function public.enforce_plan_quota('leads');

-- ── Avisos de Stripe procesados ────────────────────────────────────────────
create table if not exists public.stripe_events (
  id           text primary key check (char_length(id) <= 255),
  type         text not null check (char_length(type) <= 100),
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant select, insert, update on public.stripe_events to service_role;

-- ── Suscripción (solo la llama el webhook de Stripe) ───────────────────────
-- p_plan: plan del precio suscrito (galon | cubeta). El estado de Stripe
-- decide el plan de la tienda:
--   active / trialing / past_due        → p_plan
--   canceled / unpaid / incomplete_expired → litro (la cortesía interno se respeta)
--   incomplete u otro                    → no cambia el plan
-- Al bajar de usuarios incluidos (y no ser Litro, que se resuelve en cada
-- petición: solo entra el dueño), los administradores pasan a vendedores si el
-- plan no los permite, se desactivan los más recientes que sobren y se
-- cancelan las invitaciones pendientes.
create or replace function public.apply_stripe_subscription(
  p_store uuid, p_customer text, p_subscription text, p_status text, p_plan text,
  p_period_end timestamptz, p_cancel_at_period_end boolean, p_plans jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s          public.stores%rowtype;
  v_paid     boolean := p_status in ('active', 'trialing', 'past_due');
  v_ended    boolean := p_status in ('canceled', 'unpaid', 'incomplete_expired');
  v_plan     text;
  v_prev     text;
  v_limits   jsonb;
  v_max      integer;
  v_disabled integer := 0;
  v_demoted  integer := 0;
begin
  if p_customer is null or p_subscription is null or p_status is null then
    raise exception 'Datos de suscripción incompletos' using errcode = 'P0001';
  end if;
  if v_paid and p_plan not in ('galon', 'cubeta') then
    raise exception 'Plan de Stripe desconocido' using errcode = 'P0001';
  end if;

  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  if s.stripe_customer_id is not null and s.stripe_customer_id <> p_customer then
    raise exception 'El cliente de Stripe no corresponde a la tienda' using errcode = 'P0001';
  end if;
  -- Aviso de una suscripción vieja mientras otra sigue vigente: se ignora
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
    stripe_customer_id     = p_customer,
    stripe_subscription_id = p_subscription,
    subscription_status    = left(p_status, 40),
    current_period_end     = p_period_end,
    cancel_at_period_end   = coalesce(p_cancel_at_period_end, false),
    plan                   = v_plan,
    paid_until             = case when v_paid then null else paid_until end,
    status                 = case when status in ('pending', 'trial') then 'active' else status end,
    updated_at             = now()
  where id = p_store;

  if v_plan <> 'litro' then
    v_limits := coalesce(p_plans -> v_plan, p_plans -> 'litro');
    v_max := coalesce((v_limits ->> 'maxUsers')::integer, 1);
    if not coalesce((v_limits ->> 'allowAdmins')::boolean, false) then
      update public.store_members set role = 'employee' where store_id = p_store and role = 'admin';
      get diagnostics v_demoted = row_count;
    end if;
    with ranked as (
      select user_id, row_number() over (order by (role = 'owner') desc, created_at asc, user_id) as rn
        from public.store_members where store_id = p_store and status = 'active'
    )
    update public.store_members m set status = 'disabled'
      from ranked r where m.store_id = p_store and m.user_id = r.user_id and r.rn > v_max and m.role <> 'owner';
    get diagnostics v_disabled = row_count;
  end if;
  -- Invitaciones pendientes que ya no caben en el plan nuevo
  if v_plan is distinct from v_prev
     and (select count(*) from public.store_members where store_id = p_store and status = 'active')
       + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
          and revoked_at is null and expires_at > now())
       > coalesce((coalesce(p_plans -> v_plan, p_plans -> 'litro') ->> 'maxUsers')::integer, 1) then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and accepted_at is null and revoked_at is null and role <> 'owner';
  end if;

  insert into public.platform_events (store_id, actor_id, action, detail)
    values (p_store, null, 'stripe_subscription', jsonb_build_object(
      'status', p_status, 'plan', v_plan, 'prev_plan', v_prev, 'subscription', p_subscription,
      'disabled_members', v_disabled, 'demoted_admins', v_demoted));

  return jsonb_build_object('plan', v_plan, 'prev_plan', v_prev, 'disabled_members', v_disabled, 'demoted_admins', v_demoted);
end $$;
revoke all on function public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb) to service_role;

-- ── Invitaciones y equipo con el plan efectivo ─────────────────────────────
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

  v_plan := coalesce(p_plans -> public.store_effective_plan(s.plan, s.paid_until), p_plans -> 'litro');
  v_max  := coalesce((v_plan ->> 'maxUsers')::integer, 1);

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
      raise exception 'El equipo de esta tienda ya está completo. Pide al dueño que libere un lugar o cambie de plan.' using errcode = 'P0001';
    end if;
    insert into public.store_members (store_id, user_id, role, status) values (s.id, p_user, inv.role, 'active');
  end if;
  -- Si ya era miembro (activo o desactivado) se respeta lo que decidió el dueño

  update public.store_invitations set accepted_at = now(), accepted_by = p_user where id = inv.id;
  return jsonb_build_object('store_id', s.id, 'already_member', v_existing.user_id is not null);
end $$;

revoke all on function public.accept_store_invitation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.accept_store_invitation(uuid, uuid, jsonb) to service_role;

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
    limits := coalesce(p_plans -> public.store_effective_plan(s.plan, s.paid_until), p_plans -> 'litro');
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
end $$;
revoke all on function public.manage_store_member(uuid,uuid,uuid,text,text,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.manage_store_member(uuid,uuid,uuid,text,text,boolean,jsonb) to service_role;

-- ── WhatsApp: solo Cubeta o Interno (y tienda no suspendida ni cancelada) ──
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
  if s.status in ('suspended', 'cancelled') then
    raise exception 'La tienda está en modo solo lectura' using errcode = 'P0001';
  end if;
  if public.store_effective_plan(s.plan, s.paid_until) not in ('cubeta', 'interno') then
    raise exception 'WhatsApp está incluido solo en el plan Cubeta' using errcode = 'P0001';
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
