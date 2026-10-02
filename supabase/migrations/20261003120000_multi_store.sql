-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tienda (SaaS) — paso 1 de 2: estructura aditiva
--
-- Convierte el CRM en una plataforma para varias tiendas IPESA. Todo lo que
-- existe hoy (usuarios, contactos, leads, actividades, recordatorios,
-- WhatsApp y catálogos) queda agrupado en la tienda #1
-- "IPESA Lomas de Angelópolis".
--
-- Compatible con el código que está en producción:
--   · cada tabla recibe store_id con DEFAULT = la tienda #1, así las
--     inserciones del código anterior (que no conoce store_id) siguen
--     cayendo en su tienda;
--   · se mantienen los únicos globales que el código anterior usa
--     (ON CONFLICT (phone) en la importación de contactos).
-- El paso 2 (20261003120100_multi_store_finalize.sql) retira esos DEFAULT y
-- únicos globales en cuanto se despliega el código nuevo.
--
-- Acceso: igual que el resto de la base, SOLO service_role (API de Next).
--
-- Aplicada en producción en partes (multi_store_1_tables … _6) porque el
-- conector cortaba a los 60 s; el contenido es exactamente este archivo.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tiendas ────────────────────────────────────────────────────────────────
create table public.stores (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique
                            check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name                    text not null check (char_length(name) between 2 and 80),
  phone                   text check (char_length(phone) <= 20),
  email                   text check (char_length(email) <= 254),
  address                 text check (char_length(address) <= 300),
  city                    text check (char_length(city) <= 80),
  state                   text check (char_length(state) <= 80),
  logo_path               text,               -- objeto en el bucket store-assets
  timezone                text not null default 'America/Mexico_City',
  status                  text not null default 'trial'
                            check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan                    text not null default 'profesional',
  trial_ends_at           timestamptz,
  paid_until              timestamptz,         -- null con status 'active' = sin vencimiento
  modules                 jsonb not null default '{"whatsapp": true, "campaigns": true, "formulas": true}'::jsonb,
  platform_notes          text,                -- notas internas del administrador de la plataforma
  onboarding_completed_at timestamptz,
  created_by              uuid references auth.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── Miembros (un usuario puede pertenecer a varias tiendas) ────────────────
create table public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'employee' check (role in ('owner', 'admin', 'employee')),
  status     text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_idx on public.store_members (user_id);

-- ── Invitaciones al equipo (enlace de un solo uso) ─────────────────────────
create table public.store_invitations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  email       text not null check (char_length(email) between 3 and 254),
  role        text not null default 'employee' check (role in ('admin', 'employee')),
  token_hash  text not null unique,   -- SHA-256 del token; el token solo viaja en el enlace
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index store_invitations_store_idx on public.store_invitations (store_id, created_at desc);

-- ── WhatsApp de cada tienda ────────────────────────────────────────────────
-- Secretos cifrados por la app (AES-256-GCM con CREDENTIALS_ENCRYPTION_KEY):
-- la base nunca ve el token ni el app secret en claro.
create table public.store_whatsapp (
  store_id           uuid primary key references public.stores(id) on delete cascade,
  credentials_source text not null default 'store' check (credentials_source in ('store', 'env')),
  phone_number_id    text unique,
  waba_id            text,
  display_phone      text,
  access_token_enc   text,
  app_secret_enc     text,
  verify_token       text not null,
  webhook_key        text not null unique,   -- /api/webhooks/whatsapp/<webhook_key>
  connected_at       timestamptz,
  updated_at         timestamptz not null default now()
);
-- Solo una tienda puede usar las credenciales del servidor (variables de entorno)
create unique index store_whatsapp_env_source_idx on public.store_whatsapp (credentials_source) where credentials_source = 'env';

-- ── Administradores de la plataforma (dueño del SaaS) ──────────────────────
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Tienda #1: todo lo que existe hoy ──────────────────────────────────────
insert into public.stores (id, slug, name, address, city, state, status, plan, onboarding_completed_at)
values ('3940d7e6-9807-43fa-9f19-f0a2efd743ce', 'ipesa-lomas-de-angelopolis', 'IPESA Lomas de Angelópolis',
        'Hidalgo 31 Local 2', 'Santa Clara Ocoyucan', 'Puebla', 'active', 'profesional', now());

alter table public.contacts               add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.leads                  add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.lead_activities        add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.reminders              add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.whatsapp_messages      add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.whatsapp_quick_replies add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
alter table public.app_config             add column store_id uuid not null default '3940d7e6-9807-43fa-9f19-f0a2efd743ce' references public.stores(id) on delete cascade;
-- push_subscriptions es por usuario/dispositivo: los avisos se filtran por
-- membresía al enviarlos.

-- Únicos por tienda (los globales se retiran en el paso 2)
alter table public.contacts   add constraint contacts_store_phone_key        unique (store_id, phone);
alter table public.app_config add constraint app_config_store_type_label_key unique (store_id, type, label);

-- Índices por tienda
create index contacts_store_created_idx           on public.contacts (store_id, created_at desc);
create index leads_store_created_idx              on public.leads (store_id, created_at desc);
create index lead_activities_store_idx            on public.lead_activities (store_id);
create index reminders_store_user_idx             on public.reminders (store_id, user_id);
create index whatsapp_messages_store_phone_idx    on public.whatsapp_messages (store_id, phone, created_at desc);
create index whatsapp_messages_store_unread_idx   on public.whatsapp_messages (store_id, phone) where direction = 'inbound' and read_at is null;
create index whatsapp_messages_store_template_idx on public.whatsapp_messages (store_id, created_at desc) where direction = 'outbound' and template_name is not null;
create index whatsapp_quick_replies_store_idx     on public.whatsapp_quick_replies (store_id);

-- ── Conversaciones: una fila por (tienda, teléfono) ────────────────────────
-- Vista nueva (el código anterior sigue leyendo whatsapp_conversations, que
-- agrupa solo por teléfono; se elimina en el paso 2). Borrar la vista vieja
-- aquí se quedaba esperando el bloqueo mientras la app la consultaba.
create view public.whatsapp_threads with (security_invoker = true) as
select distinct on (m.store_id, m.phone)
  m.phone,
  m.body          as last_body,
  m.direction     as last_direction,
  m.status        as last_status,
  m.media_type    as last_media_type,
  m.template_name as last_template,
  m.created_at    as last_at,
  (select count(*)::int from public.whatsapp_messages u
     where u.store_id = m.store_id and u.phone = m.phone and u.direction = 'inbound' and u.read_at is null) as unread,
  (select max(i.created_at) from public.whatsapp_messages i
     where i.store_id = m.store_id and i.phone = m.phone and i.direction = 'inbound') as last_inbound_at,
  (select p.profile_name from public.whatsapp_messages p
     where p.store_id = m.store_id and p.phone = m.phone and p.profile_name is not null
     order by p.created_at desc limit 1) as profile_name,
  (select c.contact_id from public.whatsapp_messages c
     where c.store_id = m.store_id and c.phone = m.phone and c.contact_id is not null
     order by c.created_at desc limit 1) as contact_id,
  m.store_id
from public.whatsapp_messages m
order by m.store_id, m.phone, m.created_at desc;

-- ── Equipo actual → miembros de la tienda #1 ───────────────────────────────
insert into public.store_members (store_id, user_id, role)
select '3940d7e6-9807-43fa-9f19-f0a2efd743ce', u.id,
       case when u.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'employee' end
from auth.users u
on conflict do nothing;

-- Dueño de la tienda y de la plataforma: el primer administrador registrado
update public.store_members m set role = 'owner'
where m.store_id = '3940d7e6-9807-43fa-9f19-f0a2efd743ce'
  and m.user_id = (select u.id from auth.users u
                   where u.raw_app_meta_data ->> 'role' = 'admin'
                   order by u.created_at limit 1);

insert into public.platform_admins (user_id)
select user_id from public.store_members
where store_id = '3940d7e6-9807-43fa-9f19-f0a2efd743ce' and role = 'owner'
on conflict do nothing;

-- WhatsApp de la tienda #1: sigue usando las credenciales del servidor
insert into public.store_whatsapp (store_id, credentials_source, verify_token, webhook_key, connected_at)
values ('3940d7e6-9807-43fa-9f19-f0a2efd743ce', 'env',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        replace(gen_random_uuid()::text, '-', ''),
        now());

-- ── Seguridad: solo service_role ───────────────────────────────────────────
alter table public.stores            enable row level security;
alter table public.store_members     enable row level security;
alter table public.store_invitations enable row level security;
alter table public.store_whatsapp    enable row level security;
alter table public.platform_admins   enable row level security;

revoke all on public.stores, public.store_members, public.store_invitations,
              public.store_whatsapp, public.platform_admins, public.whatsapp_threads
  from anon, authenticated;
grant select, insert, update, delete on public.stores, public.store_members, public.store_invitations,
                                        public.store_whatsapp, public.platform_admins to service_role;
grant select on public.whatsapp_threads to service_role;

-- ── Storage: logos de las tiendas (públicos, solo imágenes, máx. 2 MB) ─────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-assets', 'store-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
