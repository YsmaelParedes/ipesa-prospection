-- Cotizaciones (1.58.0): renglones libres, folio por tienda, enlace público y
-- conexión con el sistema comercial. Reemplaza al cotizador por m² que nunca
-- se usó (sus dos tablas solo tenían productos de ejemplo sin precio).

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_project_quote' loop
    execute format('drop function %s', f);
  end loop;
end $$;
drop table if exists public.project_quotes;
drop table if exists public.paint_products;

-- Ajustes de la tienda para sus cotizaciones (validez, condiciones, IVA, RFC)
alter table public.stores add column if not exists quote_settings jsonb not null default '{}'::jsonb;

-- Folio consecutivo por tienda: nunca se repite aunque se borre una cotización
create table public.quote_counters (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  last_folio integer not null default 0 check (last_folio >= 0)
);

create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  folio            integer not null check (folio > 0),
  created_by       uuid references auth.users(id) on delete set null,
  -- El contacto es opcional; si se borra, la cotización se queda con su copia de los datos
  contact_id       uuid,
  client_name      text not null default '' check (char_length(client_name) <= 200),
  client_phone     text not null default '' check (char_length(client_phone) <= 30),
  client_email     text not null default '' check (char_length(client_email) <= 254),
  -- [{ description, quantity, unit, price }]: lo valida el servidor antes de guardar
  items            jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  discount_kind    text not null default 'percent' check (discount_kind in ('percent', 'amount')),
  discount_value   numeric(14,2) not null default 0 check (discount_value >= 0),
  tax_rate         numeric(5,2) not null default 16 check (tax_rate in (0, 8, 16)),
  notes            text not null default '' check (char_length(notes) <= 2000),
  issued_on        date not null,
  valid_until      date not null,
  status           text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  -- Totales: siempre los calcula el servidor con los renglones
  subtotal         numeric(14,2) not null default 0 check (subtotal >= 0),
  discount         numeric(14,2) not null default 0 check (discount >= 0),
  tax              numeric(14,2) not null default 0 check (tax >= 0),
  total            numeric(12,2) not null default 0 check (total >= 0),
  share_token      text not null unique check (char_length(share_token) between 20 and 64),
  sent_at          timestamptz,
  sent_via         text check (sent_via in ('whatsapp', 'correo', 'chat', 'compartir', 'enlace', 'en_persona')),
  viewed_at        timestamptz,
  decided_at       timestamptz,
  activity_id      uuid references public.commercial_activities(id) on delete set null,
  sale_activity_id uuid references public.commercial_activities(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, folio),
  constraint quotes_contact_same_store_fkey
    foreign key (store_id, contact_id) references public.contacts (store_id, id) on delete set null (contact_id)
);
create index quotes_store_created_idx on public.quotes (store_id, created_at desc);
create index quotes_store_creator_idx on public.quotes (store_id, created_by, created_at desc);
create index quotes_contact_idx       on public.quotes (store_id, contact_id) where contact_id is not null;
create index quotes_created_by_fk_idx on public.quotes (created_by);
create index quotes_activity_idx      on public.quotes (activity_id) where activity_id is not null;
create index quotes_sale_activity_idx on public.quotes (sale_activity_id) where sale_activity_id is not null;

alter table public.quotes enable row level security;
alter table public.quote_counters enable row level security;
revoke all on public.quotes, public.quote_counters from public, anon, authenticated;
grant select, insert, update, delete on public.quotes, public.quote_counters to service_role;

-- ── Folio siguiente de la tienda ────────────────────────────────────────────
create or replace function public.next_quote_folio(p_store uuid) returns integer
language sql security definer set search_path = '' as $$
  insert into public.quote_counters as c (store_id, last_folio) values (p_store, 1)
  on conflict (store_id) do update set last_folio = c.last_folio + 1
  returning last_folio;
$$;
revoke all on function public.next_quote_folio(uuid) from public, anon, authenticated;
grant execute on function public.next_quote_folio(uuid) to service_role;

-- ── Enviar ──────────────────────────────────────────────────────────────────
-- La primera vez fecha la cotización hoy (conserva los días de validez) y, si
-- es de un contacto, registra «Cotización enviada» con su total y el
-- seguimiento a 2 días (un Cliente sigue siendo Cliente). Al reenviarla solo
-- actualiza el monto de esa actividad.
create or replace function public.send_quote(
  p_store uuid, p_actor uuid, p_quote uuid, p_via text, p_kind text, p_today date
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q          public.quotes%rowtype;
  v_status   text;
  v_activity public.commercial_activities%rowtype;
begin
  if p_kind not in ('whatsapp', 'correo', 'visita') then
    raise exception 'Tipo de actividad inválido' using errcode = 'P0001';
  end if;
  select * into q from public.quotes where id = p_quote and store_id = p_store for update;
  if not found then raise exception 'Cotización no encontrada' using errcode = 'P0002'; end if;
  if q.status not in ('draft', 'sent') then
    raise exception 'Esta cotización ya se marcó como aceptada o rechazada' using errcode = 'P0001';
  end if;

  if q.status = 'draft' then
    q.valid_until := q.valid_until + (p_today - q.issued_on);
    q.issued_on := p_today;
  end if;

  if q.contact_id is not null then
    if q.activity_id is not null then
      update public.commercial_activities set quote_amount = q.total
       where id = q.activity_id and store_id = p_store;
    else
      select commercial_status into v_status from public.contacts where id = q.contact_id and store_id = p_store;
      v_activity := public.log_commercial_activity(
        p_store, p_actor, q.contact_id, p_kind, 'cotizacion', 'Cotización #' || q.folio, q.total, null,
        'Confirmar la cotización', p_today + 2,
        case when v_status = 'cliente' then null else 'cotizacion' end, true);
      q.activity_id := v_activity.id;
    end if;
  end if;

  update public.quotes set
    status      = 'sent',
    issued_on   = q.issued_on,
    valid_until = q.valid_until,
    sent_at     = coalesce(sent_at, now()),
    sent_via    = p_via,
    activity_id = q.activity_id,
    updated_at  = now()
  where id = p_quote
  returning * into q;
  return q;
end $$;
revoke all on function public.send_quote(uuid, uuid, uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.send_quote(uuid, uuid, uuid, text, text, date) to service_role;

-- ── Aceptar, rechazar o reabrir ─────────────────────────────────────────────
-- Aceptada puede registrar la venta en el sistema comercial (una sola vez).
-- Rechazada no toca al contacto. Reabrir la regresa a Enviada.
create or replace function public.decide_quote(
  p_store uuid, p_actor uuid, p_quote uuid, p_status text, p_sale boolean, p_kind text, p_today date
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q          public.quotes%rowtype;
  v_activity public.commercial_activities%rowtype;
begin
  if p_status not in ('accepted', 'rejected', 'sent') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;
  if p_kind not in ('whatsapp', 'correo', 'visita') then
    raise exception 'Tipo de actividad inválido' using errcode = 'P0001';
  end if;
  select * into q from public.quotes where id = p_quote and store_id = p_store for update;
  if not found then raise exception 'Cotización no encontrada' using errcode = 'P0002'; end if;
  if q.status = 'draft' then
    raise exception 'Primero envía la cotización' using errcode = 'P0001';
  end if;

  if p_status = 'accepted' and coalesce(p_sale, false) and q.contact_id is not null and q.sale_activity_id is null then
    v_activity := public.log_commercial_activity(
      p_store, p_actor, q.contact_id, p_kind, 'venta', 'Cotización #' || q.folio || ' aceptada', null, q.total,
      'Ofrecer recompra', p_today + 30, 'cliente', true);
    q.sale_activity_id := v_activity.id;
  end if;

  update public.quotes set
    status           = p_status,
    decided_at       = case when p_status = 'sent' then null else now() end,
    sale_activity_id = q.sale_activity_id,
    updated_at       = now()
  where id = p_quote
  returning * into q;
  return q;
end $$;
revoke all on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) from public, anon, authenticated;
grant execute on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) to service_role;

-- ── Sugerencias de renglones ────────────────────────────────────────────────
-- Lo que ya se cotizó en la tienda, con la unidad y el último precio usado.
create or replace function public.quote_item_suggestions(p_store uuid, p_query text, p_limit integer)
returns table (description text, unit text, price numeric)
language sql stable security definer set search_path = '' as $$
  select s.description, s.unit, s.price from (
    select distinct on (lower(btrim(i->>'description')))
      btrim(i->>'description') as description,
      coalesce(i->>'unit', '') as unit,
      case when (i->>'price') ~ '^\d+(\.\d+)?$' then (i->>'price')::numeric else 0 end as price,
      q.updated_at
    from public.quotes q, jsonb_array_elements(q.items) i
    where q.store_id = p_store
      and btrim(coalesce(i->>'description', '')) <> ''
      and (coalesce(p_query, '') = ''
           or lower(i->>'description') like '%' || replace(replace(replace(lower(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
    order by lower(btrim(i->>'description')), q.updated_at desc
  ) s
  order by s.updated_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;
revoke all on function public.quote_item_suggestions(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.quote_item_suggestions(uuid, text, integer) to service_role;
