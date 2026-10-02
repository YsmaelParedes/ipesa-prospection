-- ════════════════════════════════════════════════════════════════════════════
-- IPESA CRM — esquema actual de Supabase (snapshot de producción, 2026-10-02)
--
-- Referencia de cómo está la base HOY. Reemplaza a los archivos 001–011 de
-- migrations/, que documentaban tablas que ya no existen y políticas "allow
-- all" para anon que se revocaron (re-ejecutarlos abriría la base otra vez).
-- Los cambios nuevos van como migraciones con fecha en supabase/migrations/.
--
-- Modelo de acceso: TODA lectura/escritura pasa por las API routes de Next.js
-- con la service_role key (bypassa RLS). anon/authenticated no tienen
-- privilegios sobre public; el navegador solo usa la anon key para Auth.
-- El rol de administrador vive en auth.users.raw_app_meta_data->>'role'.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Catálogos editables (segmentos y canales) ──────────────────────────────
create table public.app_config (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('segment', 'canal')),
  label      text not null,
  created_at timestamptz default now(),
  unique (type, label)
);

-- ── Contactos (base compartida por todo el equipo) ─────────────────────────
create table public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  name                varchar(255) not null,
  phone               varchar(20)  not null unique,    -- 10 dígitos nacionales
  company             varchar(255),
  address             text,
  postal_code         text,
  segment             varchar(100),
  acquisition_channel text default '',
  email               text default '',
  prospect_status     varchar(50) default 'nuevo',    -- heredado de la etapa de prospección (sin uso en la app)
  wa_opt_out          boolean not null default false,  -- pidió no recibir campañas de WhatsApp
  wa_opt_out_at       timestamptz,
  created_at          timestamp default now(),         -- hora UTC sin zona
  updated_at          timestamp default now()
);
create index idx_contacts_segment on public.contacts (segment);

-- ── Leads (pipeline; cada uno pertenece a un vendedor) ─────────────────────
create table public.leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  phone      text not null default '',
  email      text not null default '',
  canal      text not null default 'Otro',
  segmento   text not null default 'Residencial',
  estado     text not null default 'Nuevo',  -- Nuevo | En seguimiento | Cotizado | Ganado / Venta realizada | Perdido
  monto      numeric,
  notas      text,
  contact_id uuid references public.contacts(id) on delete set null,
  fecha      date not null default current_date,
  created_at timestamptz not null default now(),
  user_id    uuid                             -- dueño; NULL = heredado, visible para todos
);
create index idx_leads_user_id      on public.leads (user_id);
create index leads_contact_id_idx   on public.leads (contact_id);
create index leads_created_at_idx   on public.leads (created_at desc);

-- ── Actividades de seguimiento de un lead ──────────────────────────────────
create table public.lead_activities (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.leads(id) on delete cascade,
  user_id       uuid,
  type          text not null default 'note', -- call | email | whatsapp | quote | meeting | visit | note
  description   text,
  amount        numeric,                      -- solo cotizaciones
  activity_date timestamptz default now(),
  created_at    timestamptz default now()
);
create index idx_lead_activities_lead_id on public.lead_activities (lead_id);
create index idx_lead_activities_user_id on public.lead_activities (user_id);
create index idx_lead_activities_date    on public.lead_activities (activity_date desc);

-- ── Recordatorios (personales de cada usuario) ─────────────────────────────
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  reminder_date timestamp not null,  -- hora LOCAL de México tal cual la eligió el usuario (sin zona)
  lead_id       uuid references public.leads(id) on delete cascade,
  lead_name     text not null default '',
  nota          text not null default '',
  completado    boolean not null default false,
  completado_at timestamptz,
  user_id       uuid,
  type          text default 'task',   -- task | call | email | whatsapp | meeting
  priority      text default 'medium', -- low | medium | high
  push_sent     boolean not null default false,
  created_at    timestamp default now()
);
create index idx_reminders_date         on public.reminders (reminder_date);
create index reminders_lead_id_idx      on public.reminders (lead_id);
create index reminders_user_id_idx      on public.reminders (user_id);
create index reminders_pending_push_idx on public.reminders (reminder_date) where completado = false and push_sent = false;

-- ── Suscripciones Web Push (una por dispositivo) ───────────────────────────
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_id         uuid,
  notify_whatsapp boolean not null default true,
  created_at      timestamptz default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- ── WhatsApp: mensajes entrantes y salientes ───────────────────────────────
create table public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete set null,
  phone         text not null,                -- 10 dígitos
  direction     text not null check (direction in ('inbound', 'outbound')),
  body          text,
  wa_message_id text,                         -- wamid… de Meta
  status        text not null default 'received', -- received | sent | delivered | read | failed
  template_name text,                         -- solo salientes de plantilla
  error_message text,
  user_id       uuid,                         -- quién envió (salientes)
  media_id      text,                         -- multimedia entrante (se descarga por /api/whatsapp/media)
  media_type    text,                         -- image | audio | video | document | sticker
  media_mime    text,
  profile_name  text,                         -- nombre de perfil de WhatsApp del remitente
  read_at       timestamptz,                  -- cuándo lo vio el equipo (entrantes)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index whatsapp_messages_phone_idx         on public.whatsapp_messages (phone, created_at desc);
create index whatsapp_messages_contact_idx       on public.whatsapp_messages (contact_id);
create unique index whatsapp_messages_wa_id_idx  on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;
create index whatsapp_messages_unread_idx        on public.whatsapp_messages (phone) where direction = 'inbound' and read_at is null;
create index whatsapp_messages_template_sent_idx on public.whatsapp_messages (created_at desc) where direction = 'outbound' and template_name is not null;

-- ── WhatsApp: respuestas rápidas del equipo ────────────────────────────────
create table public.whatsapp_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  body       text not null check (char_length(body) between 1 and 1000),
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ── WhatsApp: una fila por conversación ────────────────────────────────────
create view public.whatsapp_conversations with (security_invoker = true) as
select distinct on (m.phone)
  m.phone,
  m.body          as last_body,
  m.direction     as last_direction,
  m.status        as last_status,
  m.media_type    as last_media_type,
  m.template_name as last_template,
  m.created_at    as last_at,
  (select count(*)::int from public.whatsapp_messages u
     where u.phone = m.phone and u.direction = 'inbound' and u.read_at is null) as unread,
  (select max(i.created_at) from public.whatsapp_messages i
     where i.phone = m.phone and i.direction = 'inbound') as last_inbound_at,
  (select p.profile_name from public.whatsapp_messages p
     where p.phone = m.phone and p.profile_name is not null
     order by p.created_at desc limit 1) as profile_name,
  (select c.contact_id from public.whatsapp_messages c
     where c.phone = m.phone and c.contact_id is not null
     order by c.created_at desc limit 1) as contact_id
from public.whatsapp_messages m
order by m.phone, m.created_at desc;

-- ── Seguridad ──────────────────────────────────────────────────────────────
alter table public.app_config             enable row level security;
alter table public.contacts               enable row level security;
alter table public.leads                  enable row level security;
alter table public.lead_activities        enable row level security;
alter table public.reminders              enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.whatsapp_messages      enable row level security;
alter table public.whatsapp_quick_replies enable row level security;

-- Defensa en profundidad: aunque se volviera a otorgar acceso a
-- `authenticated`, cada quien solo vería sus propias filas.
create policy leads_user_only           on public.leads              for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy lead_activities_user_only on public.lead_activities    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reminders_user_only       on public.reminders          for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subs_user_only       on public.push_subscriptions for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ── Storage ────────────────────────────────────────────────────────────────
-- Bucket público "whatsapp-media": imágenes de encabezado de plantillas (Meta
-- las descarga por URL). Solo JPEG/PNG, máx. 5 MB; se sube vía API (admin).
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('whatsapp-media', 'whatsapp-media', true, 5242880, array['image/jpeg', 'image/png']);
