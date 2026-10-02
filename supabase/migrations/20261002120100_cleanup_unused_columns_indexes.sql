-- ════════════════════════════════════════════════════════════════════════════
-- Limpieza de columnas e índices sin uso (debug 2026-10-02)
--
-- Columnas heredadas de versiones anteriores que ningún archivo del código
-- lee ni escribe, verificadas vacías antes de borrar:
--   reminders.contact_id    → 0 filas con valor (además su FK no tenía índice)
--   reminders.campaign_id   → 0 filas con valor (la tabla campaigns ya no existe)
--   reminders.reminder_type → todas con el default 'follow_up' (se usa `type`)
--   reminders.is_completed  → todas en false (se usa `completado`)
--   contacts.follow_up_date → 0 filas con valor
--
-- contacts.prospect_status NO se borra: tiene datos (243 filas) de la etapa
-- de prospección anterior, aunque la app actual no lo muestre.
--
-- Índices: idx_contacts_phone duplica al índice único contacts_phone_key;
-- los de leads (estado/canal/segmento) y reminders.completado nunca se usan
-- porque esos filtros se aplican en el cliente (el linter de Supabase los
-- reporta como "unused").
-- ════════════════════════════════════════════════════════════════════════════

alter table public.reminders
  drop column if exists contact_id,
  drop column if exists campaign_id,
  drop column if exists reminder_type,
  drop column if exists is_completed;

alter table public.contacts
  drop column if exists follow_up_date;

drop index if exists public.idx_contacts_phone;
drop index if exists public.leads_estado_idx;
drop index if exists public.leads_canal_idx;
drop index if exists public.leads_segmento_idx;
drop index if exists public.reminders_completado_idx;

-- El cron de recordatorios filtra pendientes no notificados por fecha.
create index if not exists reminders_pending_push_idx
  on public.reminders (reminder_date)
  where completado = false and push_sent = false;
