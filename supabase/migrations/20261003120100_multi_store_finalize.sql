-- ════════════════════════════════════════════════════════════════════════════
-- Multi-tienda (SaaS) — paso 2 de 2
--
-- APLICAR JUSTO DESPUÉS de desplegar el código multi-tienda (que siempre
-- envía store_id). Retira lo que solo existía para no romper el código
-- anterior durante la transición:
--   · DEFAULT de store_id: sin él, una inserción que olvide la tienda falla
--     en vez de caer en silencio en la tienda #1;
--   · únicos globales (teléfono, catálogos): ahora cada tienda tiene los
--     suyos y dos tiendas pueden registrar el mismo cliente o "Hogar";
--   · índices por teléfono que reemplazan los nuevos por (tienda, teléfono);
--   · la vista whatsapp_conversations (agrupaba solo por teléfono), reemplazada
--     por whatsapp_threads.
-- ════════════════════════════════════════════════════════════════════════════

-- Si algo mantiene ocupada una tabla o la vista, fallar rápido y reintentar
-- en vez de quedarse esperando.
set lock_timeout = '8s';

alter table public.contacts               alter column store_id drop default;
alter table public.leads                  alter column store_id drop default;
alter table public.lead_activities        alter column store_id drop default;
alter table public.reminders              alter column store_id drop default;
alter table public.whatsapp_messages      alter column store_id drop default;
alter table public.whatsapp_quick_replies alter column store_id drop default;
alter table public.app_config             alter column store_id drop default;

alter table public.contacts   drop constraint if exists contacts_phone_key;
alter table public.app_config drop constraint if exists app_config_type_label_key;

drop index if exists public.whatsapp_messages_phone_idx;
drop index if exists public.whatsapp_messages_unread_idx;
drop index if exists public.whatsapp_messages_template_sent_idx;

drop view if exists public.whatsapp_conversations;
