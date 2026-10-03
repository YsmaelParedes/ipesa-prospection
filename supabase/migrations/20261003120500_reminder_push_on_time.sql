-- Avisos de la Agenda a la hora exacta (gratis, dentro de Supabase).
--
-- El plan Hobby de Vercel solo permite crons diarios, así que los avisos de
-- recordatorios salían una vez al día (8:00). Ahora pg_cron revisa cada minuto
-- si ya toca algún recordatorio y, solo entonces, llama a la app:
--   GET https://crm-pinturas.vercel.app/api/cron/reminders
--
-- Sin secretos compartidos: justo antes de llamar guarda un pase de un solo
-- uso en cron_tokens; la app lo borra al recibirlo y caduca en 5 minutos.
--
-- Si cambia el dominio de la app, vuelve a correr el cron.schedule de
-- 'crm-avisos-recordatorios' con la dirección nueva (mismo nombre = lo reemplaza).

create extension if not exists pg_cron with schema pg_catalog;
-- En "extensions" (no en "public", lo marca el linter); sus funciones viven en "net"
create extension if not exists pg_net with schema extensions;

-- ── Pases de un solo uso (solo service_role los lee y borra) ───────────────
create table if not exists public.cron_tokens (
  token      text primary key,
  created_at timestamptz not null default now()
);
alter table public.cron_tokens enable row level security;
revoke all on public.cron_tokens from anon, authenticated;
grant select, delete on public.cron_tokens to service_role;

-- ── Cada minuto: ¿ya toca algún recordatorio? (hora local de su tienda) ────
select cron.schedule(
  'crm-avisos-recordatorios',
  '* * * * *',
  $job$
  with pendiente as (
    select 1
      from public.reminders r
      join public.stores s on s.id = r.store_id
     where r.completado = false
       and r.push_sent = false
       and r.user_id is not null
       and r.reminder_date <= (now() at time zone s.timezone)
     limit 1
  ), pase as (
    insert into public.cron_tokens (token)
    select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
      from pendiente
    returning token
  )
  select net.http_get(
           url := 'https://crm-pinturas.vercel.app/api/cron/reminders',
           headers := jsonb_build_object('Authorization', 'Bearer ' || token),
           timeout_milliseconds := 30000
         )
    from pase;
  $job$
);

-- ── Limpieza diaria: pases sin usar e historial de pg_cron (1 fila por minuto) ─
select cron.schedule(
  'crm-limpieza-pases',
  '20 9 * * *',
  $job$ delete from public.cron_tokens where created_at < now() - interval '1 hour' $job$
);
select cron.schedule(
  'crm-limpieza-historial-cron',
  '25 9 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$
);
