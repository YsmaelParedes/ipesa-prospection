-- Elimina políticas RLS "allow all" (qual/with_check = true) que exponían
-- estas tablas públicamente vía la anon key. La app usa exclusivamente el
-- service role (que bypassa RLS) para todas sus operaciones reales, así que
-- quitar estas políticas no afecta funcionalidad — solo cierra el acceso
-- público directo vía la API REST de Supabase con la anon key.
--
-- Encontrado durante limpieza 2026-09-26: contacts (574 filas reales) y
-- app_config (34 filas) tenían políticas "allow all" activas, exponiendo
-- datos de producción a cualquiera con la anon key pública. Ver SECURITY.md,
-- item pendiente #6 (auditoría 2026-05-27), nunca resuelto hasta ahora.
--
-- Aplicado directamente en producción vía MCP el 2026-09-26; este archivo
-- documenta el cambio en el repo (la migración real vive en el historial
-- de Supabase con timestamp propio, ver `supabase migration list`).

DROP POLICY IF EXISTS "allow_all_contacts" ON public.contacts;
DROP POLICY IF EXISTS "contacts_all" ON public.contacts;

DROP POLICY IF EXISTS "allow_all_config" ON public.app_config;

DROP POLICY IF EXISTS "allow_all_campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_all" ON public.campaigns;

DROP POLICY IF EXISTS "allow_all" ON public.contact_analytics;
DROP POLICY IF EXISTS "contact_analytics_all" ON public.contact_analytics;

DROP POLICY IF EXISTS "allow_all" ON public.contact_follow_ups;
DROP POLICY IF EXISTS "contact_follow_ups_all" ON public.contact_follow_ups;

DROP POLICY IF EXISTS "allow_all" ON public.contact_notes;
DROP POLICY IF EXISTS "contact_notes_all" ON public.contact_notes;

DROP POLICY IF EXISTS "allow_all" ON public.follow_up_sequences;
DROP POLICY IF EXISTS "follow_up_sequences_all" ON public.follow_up_sequences;

DROP POLICY IF EXISTS "allow_all" ON public.follow_up_stages;
DROP POLICY IF EXISTS "follow_up_stages_all" ON public.follow_up_stages;

DROP POLICY IF EXISTS "allow_all_segments" ON public.segments;
DROP POLICY IF EXISTS "segments_all" ON public.segments;

DROP POLICY IF EXISTS "allow all" ON public.templates;
DROP POLICY IF EXISTS "allow_all_templates" ON public.templates;
DROP POLICY IF EXISTS "templates_all" ON public.templates;

DROP POLICY IF EXISTS "message_logs_all" ON public.message_logs;

DROP POLICY IF EXISTS "scores_open" ON public.game_scores;
