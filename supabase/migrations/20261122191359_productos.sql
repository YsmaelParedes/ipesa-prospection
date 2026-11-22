-- Productos (1.66.0): el catálogo de la tienda con sus listas de precios,
-- importable desde Excel y usado en las cotizaciones.
--  · price_lists: las listas de cada tienda (Público, Tarjeta, Mayoreo…);
--    una es la principal. Toda tienda tiene Público desde el inicio.
--  · products: sus precios van en `prices` ({ "<id de lista>": precio con
--    IVA }). Las existencias son solo de consulta (se actualizan al importar).
--  · Litro: hasta 200 productos (plan_quota + enforce_plan_quota, como contactos).
--  · import_products: crea o actualiza por clave (o SKU) sin borrar lo que
--    llegue vacío, y respeta el límite del plan.
-- Gemelas en TypeScript: lib/products.ts y lib/productsServer.ts.

-- ── Listas de precios ───────────────────────────────────────────────────────
create table public.price_lists (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  is_main    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, id)
);
create unique index price_lists_store_name_idx on public.price_lists (store_id, lower(btrim(name)));
-- Una sola principal por tienda
create unique index price_lists_store_main_idx on public.price_lists (store_id) where is_main;

-- ── Productos ───────────────────────────────────────────────────────────────
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  kind        text not null default 'product' check (kind in ('product', 'service')),
  name        text not null check (char_length(btrim(name)) between 1 and 300),
  -- Clave con la que se reconoce al volver a importar (el «Identificador» de Pulpos)
  ext_key     text check (char_length(ext_key) between 1 and 200),
  sku         text check (char_length(sku) between 1 and 80),
  barcode     text check (char_length(barcode) between 1 and 80),
  category    text check (char_length(category) between 1 and 100),
  brand       text check (char_length(brand) between 1 and 100),
  unit        text check (char_length(unit) between 1 and 40),
  description text check (char_length(description) <= 2000),
  cost        numeric(14,2) check (cost >= 0),
  tax_rate    numeric(5,2) not null default 16 check (tax_rate in (0, 8, 16)),
  stock       numeric(14,3),
  prices      jsonb not null default '{}'::jsonb check (jsonb_typeof(prices) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index products_store_name_idx on public.products (store_id, lower(name), id);
create index products_store_created_idx on public.products (store_id, created_at desc);
create unique index products_store_key_idx on public.products (store_id, ext_key) where ext_key is not null;
create index products_store_sku_idx on public.products (store_id, sku) where sku is not null;

alter table public.price_lists enable row level security;
alter table public.products enable row level security;
revoke all on public.price_lists, public.products from public, anon, authenticated;
grant select, insert, update, delete on public.price_lists, public.products to service_role;

-- ── Público para cada tienda (y para las que se abran después) ──────────────
insert into public.price_lists (store_id, name, is_main)
  select s.id, 'Público', true from public.stores s
  where not exists (select 1 from public.price_lists l where l.store_id = s.id);

create or replace function public.store_default_price_list()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.price_lists (store_id, name, is_main) values (new.id, 'Público', true)
    on conflict do nothing;
  return new;
end $$;
revoke all on function public.store_default_price_list() from public, anon, authenticated;
create trigger stores_default_price_list after insert on public.stores
  for each row execute function public.store_default_price_list();

-- ── Límite de Litro: 200 productos ──────────────────────────────────────────
create or replace function public.plan_quota(p_plan text, p_kind text)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_plan = 'litro' and p_kind = 'contacts' then 200
    when p_plan = 'litro' and p_kind = 'products' then 200
    when p_plan = 'litro' and p_kind = 'leads' then 10
    else null
  end
$$;

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
  elsif v_kind = 'products' then
    select count(*) into v_count from public.products where store_id = new.store_id;
  else
    select count(*) into v_count from public.leads where store_id = new.store_id;
  end if;
  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT:%:%', v_kind, v_limit using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.enforce_plan_quota() from public, anon, authenticated;

create trigger products_plan_quota before insert on public.products
  for each row execute function public.enforce_plan_quota('products');

-- ── Cotizaciones: la lista de precios con la que se arma ────────────────────
alter table public.quotes add column price_list_id uuid;
alter table public.quotes add constraint quotes_price_list_same_store_fkey
  foreign key (store_id, price_list_id) references public.price_lists (store_id, id) on delete set null (price_list_id);
create index quotes_price_list_idx on public.quotes (price_list_id) where price_list_id is not null;

-- ── Un número de un JSON, solo si es número y está en el rango ──────────────
-- (primero revisa el tipo: un texto nunca llega a convertirse)
create or replace function public.jsonb_number_between(v jsonb, lo numeric, hi numeric)
returns numeric language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if v is null or jsonb_typeof(v) <> 'number' then return null; end if;
  n := (v #>> '{}')::numeric;
  return case when n between lo and hi then n end;
end $$;
revoke all on function public.jsonb_number_between(jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function public.jsonb_number_between(jsonb, numeric, numeric) to service_role;

-- ── Importar ────────────────────────────────────────────────────────────────
-- p_items: [{ key, sku, name, kind, barcode, category, brand, unit, description,
--   cost, tax_rate, stock, prices: { "<id de lista>": precio con IVA } }].
-- Se reconoce un producto por su clave (o por su id, que es la clave de los
-- que se crearon en Matices) y, si no trae clave, por su SKU. Al actualizar,
-- lo que llega vacío conserva lo que había. Lo nuevo entra mientras quepa en
-- el plan. Devuelve cuántos se crearon, actualizaron y quedaron fuera.
create or replace function public.import_products(p_store uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  it        jsonb;
  v_plan    text;
  v_limit   integer;
  v_count   integer;
  v_key     text;
  v_sku     text;
  v_name    text;
  v_prices  jsonb;
  v_found   public.products%rowtype;
  v_created integer := 0;
  v_updated integer := 0;
  v_over    integer := 0;
  v_invalid integer := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Productos inválidos' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'Se importan hasta 1,000 productos por vez' using errcode = 'P0001';
  end if;

  select public.store_effective_plan(plan, paid_until) into v_plan from public.stores where id = p_store;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  v_limit := public.plan_quota(v_plan, 'products');
  -- El mismo candado que el trigger del límite: dos importaciones a la vez no se pasan
  perform pg_advisory_xact_lock(hashtextextended('plan_quota:products:' || p_store::text, 0));
  select count(*) into v_count from public.products where store_id = p_store;

  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' then v_invalid := v_invalid + 1; continue; end if;
    v_key  := nullif(left(btrim(coalesce(it->>'key', '')), 200), '');
    v_sku  := nullif(left(btrim(coalesce(it->>'sku', '')), 80), '');
    v_name := nullif(left(btrim(coalesce(it->>'name', '')), 300), '');

    -- Solo precios de listas de esta tienda, números de 0 en adelante
    select coalesce(jsonb_object_agg(e.key, round(n.v, 2)), '{}'::jsonb) into v_prices
      from jsonb_each(case when jsonb_typeof(it->'prices') = 'object' then it->'prices' else '{}'::jsonb end) e
      join public.price_lists l on l.store_id = p_store and l.id::text = e.key
      cross join lateral (select public.jsonb_number_between(e.value, 0, 100000000) as v) n
      where n.v is not null;

    v_found := null;
    if v_key is not null then
      select * into v_found from public.products
        where store_id = p_store and (ext_key = v_key or id::text = v_key)
        order by (ext_key = v_key) desc nulls last, created_at limit 1;
    end if;
    if v_found.id is null and v_sku is not null then
      select * into v_found from public.products where store_id = p_store and sku = v_sku order by created_at limit 1;
    end if;

    if v_found.id is not null then
      update public.products p set
        name        = coalesce(v_name, p.name),
        kind        = case when it->>'kind' in ('product', 'service') then it->>'kind' else p.kind end,
        -- La clave se guarda si aún no tenía una (y no es su propio id)
        ext_key     = coalesce(p.ext_key, case when v_key is not null and v_key <> p.id::text
                        and not exists (select 1 from public.products o where o.store_id = p_store and o.ext_key = v_key)
                        then v_key end),
        sku         = coalesce(v_sku, p.sku),
        barcode     = coalesce(nullif(left(btrim(coalesce(it->>'barcode', '')), 80), ''), p.barcode),
        category    = coalesce(nullif(left(btrim(coalesce(it->>'category', '')), 100), ''), p.category),
        brand       = coalesce(nullif(left(btrim(coalesce(it->>'brand', '')), 100), ''), p.brand),
        unit        = coalesce(nullif(left(btrim(coalesce(it->>'unit', '')), 40), ''), p.unit),
        description = coalesce(nullif(left(btrim(coalesce(it->>'description', '')), 2000), ''), p.description),
        cost        = coalesce(round(public.jsonb_number_between(it->'cost', 0, 100000000), 2), p.cost),
        tax_rate    = case when it->>'tax_rate' in ('0', '8', '16') then (it->>'tax_rate')::numeric else p.tax_rate end,
        stock       = coalesce(round(public.jsonb_number_between(it->'stock', -99999999999, 99999999999), 3), p.stock),
        prices      = p.prices || v_prices,
        updated_at  = now()
      where p.id = v_found.id;
      v_updated := v_updated + 1;
    elsif v_name is null then
      v_invalid := v_invalid + 1;
    elsif v_limit is not null and v_count >= v_limit then
      v_over := v_over + 1;
    else
      insert into public.products (store_id, kind, name, ext_key, sku, barcode, category, brand, unit, description, cost, tax_rate, stock, prices)
      values (
        p_store,
        case when it->>'kind' = 'service' then 'service' else 'product' end,
        v_name,
        case when v_key is not null and not exists (select 1 from public.products o where o.store_id = p_store and o.ext_key = v_key) then v_key end,
        v_sku,
        nullif(left(btrim(coalesce(it->>'barcode', '')), 80), ''),
        nullif(left(btrim(coalesce(it->>'category', '')), 100), ''),
        nullif(left(btrim(coalesce(it->>'brand', '')), 100), ''),
        nullif(left(btrim(coalesce(it->>'unit', '')), 40), ''),
        nullif(left(btrim(coalesce(it->>'description', '')), 2000), ''),
        round(public.jsonb_number_between(it->'cost', 0, 100000000), 2),
        case when it->>'tax_rate' in ('0', '8') then (it->>'tax_rate')::numeric else 16 end,
        round(public.jsonb_number_between(it->'stock', -99999999999, 99999999999), 3),
        v_prices);
      v_created := v_created + 1;
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'overLimit', v_over, 'invalid', v_invalid, 'limit', v_limit);
end $$;
revoke all on function public.import_products(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_products(uuid, jsonb) to service_role;

-- ── Listas: las de un archivo (las crea si no existen) ──────────────────────
-- Devuelve el id de cada nombre en el mismo orden. Hasta 20 listas por tienda.
create or replace function public.ensure_price_lists(p_store uuid, p_names text[])
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_id   uuid;
  v_out  uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtextextended('price_lists:' || p_store::text, 0));
  foreach v_name in array coalesce(p_names, '{}') loop
    v_name := left(btrim(coalesce(v_name, '')), 80);
    if v_name = '' then raise exception 'Cada lista de precios necesita un nombre' using errcode = 'P0001'; end if;
    select id into v_id from public.price_lists where store_id = p_store and lower(btrim(name)) = lower(v_name);
    if v_id is null then
      if (select count(*) from public.price_lists where store_id = p_store) >= 20 then
        raise exception 'Una tienda puede tener hasta 20 listas de precios' using errcode = 'P0001';
      end if;
      insert into public.price_lists (store_id, name, is_main)
        values (p_store, v_name, not exists (select 1 from public.price_lists where store_id = p_store and is_main))
        returning id into v_id;
    end if;
    v_out := v_out || v_id;
  end loop;
  return v_out;
end $$;
revoke all on function public.ensure_price_lists(uuid, text[]) from public, anon, authenticated;
grant execute on function public.ensure_price_lists(uuid, text[]) to service_role;

-- ── Elegir la principal ─────────────────────────────────────────────────────
create or replace function public.set_main_price_list(p_store uuid, p_list uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.price_lists where id = p_list and store_id = p_store) then
    raise exception 'Lista de precios no encontrada' using errcode = 'P0002';
  end if;
  update public.price_lists set is_main = false where store_id = p_store and is_main and id <> p_list;
  update public.price_lists set is_main = true where id = p_list and store_id = p_store;
end $$;
revoke all on function public.set_main_price_list(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_main_price_list(uuid, uuid) to service_role;

-- ── Borrar una lista: sus precios salen de todos los productos ──────────────
create or replace function public.delete_price_list(p_store uuid, p_list uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_main boolean;
begin
  select is_main into v_main from public.price_lists where id = p_list and store_id = p_store for update;
  if not found then raise exception 'Lista de precios no encontrada' using errcode = 'P0002'; end if;
  if v_main then raise exception 'La lista principal no se puede borrar' using errcode = 'P0001'; end if;
  update public.products set prices = prices - p_list::text, updated_at = now()
    where store_id = p_store and prices ? p_list::text;
  delete from public.price_lists where id = p_list and store_id = p_store;
end $$;
revoke all on function public.delete_price_list(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_price_list(uuid, uuid) to service_role;

-- ── Buscar ──────────────────────────────────────────────────────────────────
-- Cada palabra tiene que aparecer en el nombre, SKU, código, marca, categoría
-- o unidad, sin importar mayúsculas ni acentos («galon» encuentra «Galón»).
-- Orden: nombre (A–Z o Z–A) o los más recientes.
create or replace function public.search_products(
  p_store uuid, p_query text, p_category text, p_brand text, p_order text, p_limit integer, p_offset integer
) returns jsonb language sql stable security definer set search_path = '' as $$
  with words as (
    select '%' || replace(replace(replace(translate(lower(w), 'áéíóúüñ', 'aeiouun'), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from unnest(regexp_split_to_array(btrim(coalesce(p_query, '')), '\s+')) w
    where w <> ''
  ),
  hits as (
    select p.* from public.products p
    where p.store_id = p_store
      and (coalesce(p_category, '') = '' or p.category = p_category)
      and (coalesce(p_brand, '') = '' or p.brand = p_brand)
      and not exists (
        select 1 from words
        where translate(lower(concat_ws(' ', p.name, p.sku, p.barcode, p.brand, p.category, p.unit, p.ext_key)), 'áéíóúüñ', 'aeiouun') not like words.pat
      )
  ),
  page as (
    select * from hits
    order by
      case when p_order = 'recent' then created_at end desc,
      case when p_order = 'name_desc' then lower(name) end desc,
      case when coalesce(p_order, 'name') not in ('recent', 'name_desc') then lower(name) end asc,
      id
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'store_id') from page), '[]'::jsonb)
  )
$$;
revoke all on function public.search_products(uuid, text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.search_products(uuid, text, text, text, text, integer, integer) to service_role;

-- ── Cuántos productos tienen precio en cada lista (y el total) ──────────────
create or replace function public.price_list_counts(p_store uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'total', (select count(*) from public.products where store_id = p_store),
    'lists', coalesce((
      select jsonb_object_agg(k, n) from (
        select k, count(*) as n from public.products, jsonb_object_keys(prices) k
        where store_id = p_store group by k
      ) x), '{}'::jsonb)
  )
$$;
revoke all on function public.price_list_counts(uuid) from public, anon, authenticated;
grant execute on function public.price_list_counts(uuid) to service_role;

-- ── Categorías, marcas y unidades que ya usa la tienda (filtros y formulario)
create or replace function public.product_facets(p_store uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(c order by lower(c)) from (select distinct category c from public.products where store_id = p_store and category is not null) x), '[]'::jsonb),
    'brands',     coalesce((select jsonb_agg(b order by lower(b)) from (select distinct brand b from public.products where store_id = p_store and brand is not null) x), '[]'::jsonb),
    'units',      coalesce((select jsonb_agg(u order by lower(u)) from (select distinct unit u from public.products where store_id = p_store and unit is not null) x), '[]'::jsonb)
  )
$$;
revoke all on function public.product_facets(uuid) from public, anon, authenticated;
grant execute on function public.product_facets(uuid) to service_role;
