-- Bandeja de conversación de WhatsApp: mensajes entrantes y salientes
-- (tanto plantillas de campaña como respuestas de texto libre).
create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid references public.contacts(id) on delete set null,
  phone         text not null,              -- normalizado, 10 dígitos MX
  direction     text not null check (direction in ('inbound', 'outbound')),
  body          text,
  wa_message_id text,                       -- id de WhatsApp (wamid...), único cuando existe
  status        text not null default 'received', -- received | sent | delivered | read | failed
  template_name text,                       -- solo aplica a salientes tipo plantilla
  error_message text,
  user_id       uuid,                       -- quién mandó la respuesta (solo salientes manuales)
  read_at       timestamptz,                -- cuándo lo vio el equipo (solo aplica a entrantes)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists whatsapp_messages_phone_idx on public.whatsapp_messages (phone, created_at desc);
create index if not exists whatsapp_messages_contact_idx on public.whatsapp_messages (contact_id);
create unique index if not exists whatsapp_messages_wa_id_idx on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;

alter table public.whatsapp_messages enable row level security;
-- Sin políticas adicionales: todo el acceso pasa por las rutas de API con
-- el cliente de service-role (bypassa RLS); bloquea acceso directo desde
-- el cliente, igual que el resto de las tablas de la app.
