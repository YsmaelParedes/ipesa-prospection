-- Vuelven los avisos a la hora de cada recordatorio, con el reloj FUERA de la base.
--
-- Un Worker de Cloudflare (workers/avisos) llama cada minuto a
-- /api/cron/reminders con una llave. Aquí solo se guarda el SHA-256 de esa
-- llave (fila 'cloudflare-avisos'): la llave misma vive únicamente como
-- secreto del Worker. Cada vuelta solo LEE (reminders_pending_push_idx); se
-- escribe únicamente cuando un recordatorio ya llegó a su hora. Así no se
-- repite lo de pg_cron (20261022230000_drop_reminder_push_on_time.sql).
--
-- Solo el servidor (service_role) la usa; anon y authenticated no tienen permisos.
create table if not exists public.cron_keys (
  name       text primary key check (char_length(name) <= 60),
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.cron_keys enable row level security;
revoke all on public.cron_keys from public, anon, authenticated;
grant select, insert, update, delete on public.cron_keys to service_role;
