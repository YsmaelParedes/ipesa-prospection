-- ════════════════════════════════════════════════════════════════════════════
-- WhatsApp integrado al CRM (2026-10-02)
-- Todo es aditivo: el código anterior sigue funcionando sin cambios.
-- ════════════════════════════════════════════════════════════════════════════

-- Contactos que pidieron no recibir campañas (manual o respondiendo "BAJA").
alter table public.contacts
  add column if not exists wa_opt_out    boolean not null default false,
  add column if not exists wa_opt_out_at timestamptz;

-- Multimedia entrante (id de Meta para descargarla bajo demanda vía la API
-- de la app) y nombre de perfil de WhatsApp del remitente.
alter table public.whatsapp_messages
  add column if not exists media_id     text,
  add column if not exists media_type   text,
  add column if not exists media_mime   text,
  add column if not exists profile_name text;

create index if not exists whatsapp_messages_unread_idx
  on public.whatsapp_messages (phone)
  where direction = 'inbound' and read_at is null;

create index if not exists whatsapp_messages_template_sent_idx
  on public.whatsapp_messages (created_at desc)
  where direction = 'outbound' and template_name is not null;

-- Preferencia por dispositivo: avisar con push cuando llega un WhatsApp.
alter table public.push_subscriptions
  add column if not exists notify_whatsapp boolean not null default true;

-- Respuestas rápidas compartidas por el equipo.
create table if not exists public.whatsapp_quick_replies (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  body       text not null check (char_length(body) between 1 and 1000),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.whatsapp_quick_replies enable row level security;
revoke all on public.whatsapp_quick_replies from anon, authenticated;

-- Una fila por número: último mensaje, no leídos y última respuesta del
-- cliente (para la ventana de 24 h). Reemplaza traer 1000 mensajes y
-- agruparlos en JS, que además perdía conversaciones antiguas.
create or replace view public.whatsapp_conversations
with (security_invoker = true) as
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

revoke all on public.whatsapp_conversations from anon, authenticated;
