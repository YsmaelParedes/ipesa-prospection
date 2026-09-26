-- Elimina tablas huérfanas confirmadas: ninguna está referenciada por el
-- código de la app (`grep -rn ".from('...')"` sobre todo el repo). Todas ya
-- tenían su acceso público cerrado en la migración 009. Confirmado antes de
-- borrar: 0/44 reminders usaban campaign_id (la única FK activa que las
-- tocaba), y las tablas activas (contacts, reminders, leads, app_config,
-- push_subscriptions, lead_activities, whatsapp_messages) mantuvieron
-- exactamente su mismo número de filas después del DROP.
--
-- Filas que tenían datos al momento de borrar: templates (1), segments (2),
-- contact_notes (1), game_scores (2, de una función de leaderboard que ya
-- no existe en el código — ver `app/api/data/scores` removido). El resto
-- (campaigns, contact_analytics, contact_follow_ups, follow_up_sequences,
-- follow_up_stages, message_logs, sms_templates) estaban vacías.
--
-- Aplicado directamente en producción vía MCP el 2026-09-26; este archivo
-- documenta el cambio (la migración real vive en el historial de Supabase
-- con su propio timestamp).

DROP TABLE IF EXISTS public.contact_analytics CASCADE;
DROP TABLE IF EXISTS public.contact_follow_ups CASCADE;
DROP TABLE IF EXISTS public.follow_up_stages CASCADE;
DROP TABLE IF EXISTS public.follow_up_sequences CASCADE;
DROP TABLE IF EXISTS public.campaigns CASCADE;
DROP TABLE IF EXISTS public.templates CASCADE;
DROP TABLE IF EXISTS public.segments CASCADE;
DROP TABLE IF EXISTS public.contact_notes CASCADE;
DROP TABLE IF EXISTS public.message_logs CASCADE;
DROP TABLE IF EXISTS public.game_scores CASCADE;
DROP TABLE IF EXISTS public.sms_templates CASCADE;
