-- ════════════════════════════════════════════════════════════════════════════
-- Pagos de las tiendas y bitácora del panel del dueño (etapa 4)
--
--   · store_payments: cada pago registrado a mano (transferencia, efectivo…).
--     Registrar un pago extiende la vigencia de la tienda en la MISMA
--     transacción (record_store_payment). Un pago no se borra: se anula
--     (void_store_payment) y la vigencia regresa a como estaba antes.
--   · platform_events: bitácora de lo que hace el dueño de la plataforma
--     (pagos, anulaciones, activar, suspender, plan, notas).
--
--   · stores.monthly_price: precio mensual acordado con cada tienda (no hay
--     precio general: se negocia en cada visita). Prellena el monto al
--     registrar un pago y alimenta "Ingreso mensual" y "Por cobrar".
--
-- Solo el servidor (service_role) las usa; anon y authenticated no tienen
-- ningún permiso, igual que el resto de las tablas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.stores
  add column monthly_price numeric(10,2) check (monthly_price >= 0);

create table public.store_payments (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  amount            numeric(10,2) not null check (amount >= 0),
  currency          text not null default 'MXN' check (currency = 'MXN'),
  method            text not null check (method in ('transferencia', 'efectivo', 'tarjeta', 'deposito', 'cortesia', 'otro')),
  paid_on           date not null,                         -- día en que se recibió el dinero
  months            smallint not null check (months between 1 and 36),
  period_start      timestamptz not null,                  -- desde cuándo cubre
  period_end        timestamptz not null,                  -- hasta cuándo cubre (= nuevo paid_until)
  prev_status       text not null,                         -- cómo estaba la tienda antes (para anular)
  prev_paid_until   timestamptz,
  invoice_requested boolean not null default false,
  invoice_number    text check (char_length(invoice_number) <= 60),
  notes             text check (char_length(notes) <= 500),
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default clock_timestamp(),  -- orden real de captura (anular va del más reciente al más viejo)
  voided_at         timestamptz,
  voided_by         uuid references auth.users(id) on delete set null,
  void_reason       text check (char_length(void_reason) <= 300),
  constraint store_payments_period_check check (period_end > period_start)
);
create index store_payments_store_idx   on public.store_payments (store_id, created_at desc);
create index store_payments_paid_on_idx on public.store_payments (paid_on desc);

create table public.platform_events (
  id         bigint generated always as identity primary key,
  store_id   uuid references public.stores(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete set null,
  action     text not null check (char_length(action) <= 40),
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index platform_events_store_idx on public.platform_events (store_id, created_at desc);

alter table public.store_payments  enable row level security;
alter table public.platform_events enable row level security;
revoke all on public.store_payments, public.platform_events from public, anon, authenticated;
grant select, insert, update on public.store_payments to service_role;
grant select, insert on public.platform_events to service_role;

-- ── Registrar un pago y extender la vigencia (todo o nada) ──────────────────
create or replace function public.record_store_payment(
  p_store uuid, p_amount numeric, p_method text, p_paid_on date, p_months integer,
  p_invoice_requested boolean, p_invoice_number text, p_notes text, p_actor uuid
) returns public.store_payments
language plpgsql security definer set search_path = '' as $$
declare
  s     public.stores%rowtype;
  v_start timestamptz;
  v_end   timestamptz;
  v_row   public.store_payments%rowtype;
begin
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;

  -- Se suma a lo ya pagado si sigue vigente; si no, cuenta desde hoy
  v_start := case when s.paid_until is not null and s.paid_until > now() then s.paid_until else now() end;
  v_end   := v_start + make_interval(months => p_months);

  update public.stores set status = 'active', paid_until = v_end, updated_at = now() where id = p_store;

  insert into public.store_payments (
    store_id, amount, method, paid_on, months, period_start, period_end, prev_status, prev_paid_until,
    invoice_requested, invoice_number, notes, created_by
  ) values (
    p_store, p_amount, p_method, p_paid_on, p_months, v_start, v_end, s.status, s.paid_until,
    coalesce(p_invoice_requested, false), nullif(trim(p_invoice_number), ''), nullif(trim(p_notes), ''), p_actor
  ) returning * into v_row;

  insert into public.platform_events (store_id, actor_id, action, detail)
  values (p_store, p_actor, 'payment', jsonb_build_object(
    'payment_id', v_row.id, 'amount', p_amount, 'method', p_method, 'months', p_months,
    'paid_until', v_end, 'prev_paid_until', s.paid_until, 'prev_status', s.status));

  return v_row;
end $$;

-- ── Anular un pago (el último vigente de la tienda) ─────────────────────────
-- La vigencia regresa a como estaba antes del pago, salvo que se haya movido
-- a mano después (entonces solo se marca anulado y se avisa).
create or replace function public.void_store_payment(p_payment uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.store_payments%rowtype;
  s public.stores%rowtype;
  v_restored boolean := false;
begin
  select * into p from public.store_payments where id = p_payment;
  if not found then raise exception 'Pago no encontrado' using errcode = 'P0002'; end if;
  select * into s from public.stores where id = p.store_id for update;
  select * into p from public.store_payments where id = p_payment for update;

  if p.voided_at is not null then raise exception 'Este pago ya estaba anulado' using errcode = 'P0001'; end if;
  if exists (select 1 from public.store_payments
              where store_id = p.store_id and voided_at is null and id <> p.id and created_at > p.created_at) then
    raise exception 'Primero anula los pagos más recientes de esta tienda' using errcode = 'P0001';
  end if;

  update public.store_payments
     set voided_at = now(), voided_by = p_actor, void_reason = nullif(trim(p_reason), '')
   where id = p.id
  returning * into p;

  if s.paid_until is not distinct from p.period_end then
    update public.stores set status = p.prev_status, paid_until = p.prev_paid_until, updated_at = now() where id = s.id;
    v_restored := true;
  end if;

  insert into public.platform_events (store_id, actor_id, action, detail)
  values (s.id, p_actor, 'payment_void', jsonb_build_object(
    'payment_id', p.id, 'amount', p.amount, 'reason', p.void_reason, 'restored', v_restored,
    'paid_until', case when v_restored then p.prev_paid_until else s.paid_until end));

  return jsonb_build_object('payment', to_jsonb(p), 'restored', v_restored);
end $$;

revoke all on function public.record_store_payment(uuid, numeric, text, date, integer, boolean, text, text, uuid) from public, anon, authenticated;
revoke all on function public.void_store_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_store_payment(uuid, numeric, text, date, integer, boolean, text, text, uuid) to service_role;
grant execute on function public.void_store_payment(uuid, uuid, text) to service_role;
