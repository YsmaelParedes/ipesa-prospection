-- Dos planes (1.61.0): Litro gratis y Cubeta de paga. Galón deja de existir.
-- Ninguna tienda estaba en Galón ni tenía una suscripción a sus precios; los
-- precios galon_mensual y galon_anual se archivan en Stripe (no se borran).
-- Gemelas en TypeScript: PLANS / effectivePlan en lib/stores.ts.

-- 1. Precios de Stripe: la asociación precio → plan solo conoce Cubeta
delete from public.stripe_price_plans where plan = 'galon';
alter table public.stripe_price_plans drop constraint stripe_price_plans_plan_check;
alter table public.stripe_price_plans add constraint stripe_price_plans_plan_check check (plan = 'cubeta');

-- 2. Planes válidos de una tienda
update public.stores set plan = 'litro' where plan = 'galon';
alter table public.stores drop constraint stores_plan_check;
alter table public.stores add constraint stores_plan_check check (plan in ('litro', 'cubeta', 'interno'));

-- 3. Correos del fin de la prueba de Cubeta (lib/trialNotices.ts):
--    0 = ninguno, 1 = «termina en N días», 2 = «terminó tu prueba»
alter table public.stores add column if not exists trial_notices smallint not null default 0
  constraint stores_trial_notices_check check (trial_notices between 0 and 2);

-- 4. Plan que aplica hoy: una cortesía de Cubeta vencida (+3 días) cuenta como Litro
create or replace function public.store_effective_plan(p_plan text, p_paid_until timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_plan = 'cubeta'
         and p_paid_until is not null and p_paid_until + interval '3 days' <= now() then 'litro'
    when p_plan in ('litro', 'cubeta', 'interno') then p_plan
    else 'litro'
  end
$$;

-- 5. Tiendas que la limpieza de inactivas nunca toca
create or replace function public.store_retention_protected(s public.stores)
returns boolean
language sql stable set search_path = ''
as $$
  select s.retention_hold
      or coalesce(s.subscription_status, '') in ('active', 'trialing', 'past_due')
      or s.plan = 'interno'
      or (s.plan = 'cubeta' and (s.paid_until is null or s.paid_until + interval '3 days' > now()))
$$;

-- 6. Suscripción de Stripe → plan de la tienda (igual que antes; solo Cubeta es de paga)
create or replace function public.apply_stripe_subscription(p_store uuid, p_customer text, p_subscription text, p_status text, p_plan text, p_period_end timestamptz, p_cancel_at_period_end boolean, p_plans jsonb, p_lock uuid)
returns jsonb language plpgsql set search_path = '' as $$
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
  if v_paid and (p_plan is null or p_plan <> 'cubeta') then
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
end $$;
