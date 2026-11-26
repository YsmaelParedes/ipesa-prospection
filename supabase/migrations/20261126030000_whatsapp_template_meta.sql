-- Plantillas (1.71.0): lo que Matices sabe de las plantillas que se crean
-- desde la app y WhatsApp no guarda. Por ahora, si el mensaje usa el nombre
-- de cada cliente: en las plantillas hechas aquí el nombre siempre es {{1}},
-- y Campañas lo llena solo con el primer nombre del contacto.
-- El estado, el texto y los botones se consultan en vivo a WhatsApp.
-- Gemela en TypeScript: lib/whatsappTemplatesServer.ts.

create table public.whatsapp_template_meta (
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null check (name ~ '^[a-z0-9_]{1,512}$'),
  language    text not null check (language ~ '^[a-zA-Z_]{2,10}$'),
  client_name boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (store_id, name, language)
);

alter table public.whatsapp_template_meta enable row level security;
revoke all on public.whatsapp_template_meta from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_template_meta to service_role;
