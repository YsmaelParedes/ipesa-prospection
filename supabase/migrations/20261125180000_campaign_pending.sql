-- Campañas en 3 pasos (1.70.0): lo que quedó pendiente de un envío.
-- Meta limita a cuántas personas se les puede escribir en 24 h. Si una
-- campaña elige más de las que caben hoy, salen las que caben y las demás se
-- guardan aquí para enviarlas otro día con el mismo mensaje (mismo
-- campaign_id: los resultados se ven juntos). Al terminar de enviarse, la
-- fila se borra. Solo el servidor la lee (service_role), como el resto.
-- Gemela en TypeScript: lib/campaignPending.ts.

create table public.campaign_pending (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete cascade,
  campaign_id      uuid not null,
  label            text check (char_length(label) <= 120),
  template         text not null check (template ~ '^[a-z0-9_]{1,512}$'),
  language         text not null check (language ~ '^[a-zA-Z_]{2,10}$'),
  category         text check (char_length(category) <= 40),
  header_image_url text check (char_length(header_image_url) <= 2000),
  body_preview     text not null default '' check (char_length(body_preview) <= 2000),
  personalize      boolean not null default false,
  body_params      text[] not null default '{}' check (cardinality(body_params) <= 20),
  contact_ids      uuid[] not null check (cardinality(contact_ids) between 1 and 5000),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (store_id, campaign_id)
);
create index campaign_pending_store_idx on public.campaign_pending (store_id, updated_at desc);

alter table public.campaign_pending enable row level security;
revoke all on public.campaign_pending from public, anon, authenticated;
grant select, insert, update, delete on public.campaign_pending to service_role;
