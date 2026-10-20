-- Apply before deploying the corresponding server code. Only service_role can
-- coordinate billing. Leases avoid holding a SQL transaction across Stripe HTTP.
set lock_timeout = '8s';

create table public.stripe_billing_state (
  store_id uuid primary key references public.stores(id) on delete cascade,
  lock_token uuid,
  lock_until timestamptz,
  checkout_attempt uuid,
  checkout_params jsonb,
  checkout_session text,
  check ((checkout_attempt is null) = (checkout_params is null))
);
alter table public.stripe_billing_state enable row level security;
revoke all on public.stripe_billing_state from public, anon, authenticated, service_role;
grant select, insert, update on public.stripe_billing_state to service_role;

create table public.stripe_price_plans (
  price_id text primary key check (char_length(price_id) between 1 and 255),
  plan text not null check (plan in ('galon', 'cubeta'))
);
alter table public.stripe_price_plans enable row level security;
revoke all on public.stripe_price_plans from public, anon, authenticated, service_role;
-- No UPDATE: the relation between a historical price and a plan is immutable.
grant select, insert on public.stripe_price_plans to service_role;

create function public.claim_stripe_store(p_store uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare s public.stripe_billing_state%rowtype; t uuid;
begin
  insert into public.stripe_billing_state(store_id) values (p_store) on conflict do nothing;
  select * into s from public.stripe_billing_state where store_id = p_store for update;
  if s.lock_until > clock_timestamp() then return null; end if;
  t := gen_random_uuid();
  update public.stripe_billing_state set lock_token = t, lock_until = clock_timestamp() + interval '2 minutes'
    where store_id = p_store;
  return t;
end $$;

create function public.assert_stripe_store_lock(p_store uuid, p_token uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.stripe_billing_state%rowtype;
begin
  select * into s from public.stripe_billing_state where store_id = p_store for update;
  if not found or p_token is null or s.lock_token is distinct from p_token
     or s.lock_until is null or s.lock_until <= clock_timestamp() then
    raise exception 'Stripe store lease expired' using errcode = '40001';
  end if;
end $$;

create function public.release_stripe_store(p_store uuid, p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.stripe_billing_state set lock_token = null, lock_until = null
    where store_id = p_store and lock_token = p_token;
$$;

create function public.bind_stripe_customer(p_store uuid, p_token uuid, p_customer text)
returns text language plpgsql security invoker set search_path = '' as $$
declare customer text;
begin
  perform public.assert_stripe_store_lock(p_store, p_token);
  if p_customer is null or char_length(p_customer) not between 1 and 255 then
    raise exception 'Cliente de Stripe inválido' using errcode = 'P0001';
  end if;
  select stripe_customer_id into customer from public.stores where id = p_store for update;
  if customer is null then
    update public.stores set stripe_customer_id = p_customer where id = p_store;
    customer := p_customer;
  end if;
  return customer;
end $$;

-- Persist the exact Stripe request BEFORE making it. A timeout can be retried
-- with the same idempotency key and payload, even on another server instance.
create function public.save_stripe_checkout(
  p_store uuid, p_token uuid, p_attempt uuid, p_params jsonb,
  p_session text default null, p_clear boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
declare s public.stripe_billing_state%rowtype;
begin
  perform public.assert_stripe_store_lock(p_store, p_token);
  select * into s from public.stripe_billing_state where store_id = p_store;
  if p_attempt is null or (s.checkout_attempt is not null and s.checkout_attempt <> p_attempt) then
    raise exception 'Stripe checkout attempt changed' using errcode = '40001';
  end if;
  if p_clear then
    update public.stripe_billing_state set checkout_attempt = null, checkout_params = null, checkout_session = null
      where store_id = p_store;
  else
    if p_params is null or (s.checkout_params is not null and s.checkout_params <> p_params)
       or (s.checkout_session is not null and s.checkout_session is distinct from p_session) then
      raise exception 'Stripe checkout request changed' using errcode = '40001';
    end if;
    update public.stripe_billing_state set checkout_attempt = p_attempt, checkout_params = p_params,
      checkout_session = p_session where store_id = p_store;
  end if;
end $$;

alter table public.stripe_events add column processing_token uuid, add column processing_until timestamptz;

create function public.claim_stripe_event(p_id text, p_type text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.stripe_events%rowtype; t uuid;
begin
  insert into public.stripe_events(id, type) values (p_id, p_type) on conflict do nothing;
  select * into e from public.stripe_events where id = p_id for update;
  if e.processed_at is not null then return jsonb_build_object('status', 'processed'); end if;
  if e.processing_until > clock_timestamp() then return jsonb_build_object('status', 'busy'); end if;
  t := gen_random_uuid();
  update public.stripe_events set processing_token = t, processing_until = clock_timestamp() + interval '5 minutes'
    where id = p_id;
  return jsonb_build_object('status', 'claimed', 'token', t);
end $$;

create function public.finish_stripe_event(p_id text, p_token uuid, p_success boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.stripe_events set
    processed_at = case when p_success then clock_timestamp() else null end,
    processing_token = null, processing_until = null
    where id = p_id and processing_token = p_token and processed_at is null
      and (not p_success or processing_until > clock_timestamp());
  return found;
end $$;

revoke all on function public.claim_stripe_store(uuid), public.assert_stripe_store_lock(uuid,uuid),
  public.bind_stripe_customer(uuid,uuid,text),
  public.release_stripe_store(uuid,uuid), public.save_stripe_checkout(uuid,uuid,uuid,jsonb,text,boolean),
  public.claim_stripe_event(text,text), public.finish_stripe_event(text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.claim_stripe_store(uuid), public.assert_stripe_store_lock(uuid,uuid),
  public.bind_stripe_customer(uuid,uuid,text),
  public.release_stripe_store(uuid,uuid), public.save_stripe_checkout(uuid,uuid,uuid,jsonb,text,boolean),
  public.claim_stripe_event(text,text), public.finish_stripe_event(text,uuid,boolean) to service_role;

-- Remove the unguarded entry point: old workers fail safely during deployment.
drop function public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb);

create function public.apply_stripe_subscription(
  p_store uuid, p_customer text, p_subscription text, p_status text, p_plan text,
  p_period_end timestamptz, p_cancel_at_period_end boolean, p_plans jsonb, p_lock uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  if v_plan is distinct from v_prev
     and (select count(*) from public.store_members where store_id = p_store and status = 'active')
       + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
          and revoked_at is null and expires_at > now())
       > coalesce((coalesce(p_plans -> v_plan, p_plans -> 'litro') ->> 'maxUsers')::integer, 1) then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and accepted_at is null and revoked_at is null and role <> 'owner';
  end if;
  insert into public.platform_events(store_id, actor_id, action, detail)
    values (p_store, null, 'stripe_subscription', jsonb_build_object(
      'status', p_status, 'plan', v_plan, 'prev_plan', v_prev, 'subscription', p_subscription,
      'disabled_members', v_disabled, 'demoted_admins', v_demoted));
  return jsonb_build_object('plan', v_plan, 'prev_plan', v_prev,
    'disabled_members', v_disabled, 'demoted_admins', v_demoted);
end $$;
revoke all on function public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(uuid,text,text,text,text,timestamptz,boolean,jsonb,uuid)
  to service_role;

-- Existing delinquent stores receive one grace period from this migration.
update public.stores set paid_until = now()
  where subscription_status = 'past_due' and paid_until is null;
