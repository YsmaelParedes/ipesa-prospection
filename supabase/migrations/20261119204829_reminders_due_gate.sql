-- ¿Ya toca algún recordatorio? Lo pregunta el Worker de Cloudflare
-- (workers/avisos) cada minuto ANTES de despertar a la app.
--
-- Antes el Worker llamaba a /api/cron/reminders cada minuto (≈43,000 veces al
-- mes) y casi siempre no había nada que avisar: cada vuelta gastaba CPU de
-- Vercel (Fluid Active CPU, 4 h al mes en el plan gratis) para nada. Ahora el
-- Worker pregunta aquí y solo llama a la app cuando la respuesta es true.
--
-- Solo LEE, sobre el mismo índice parcial que ya usaba la app
-- (reminders_pending_push_idx): no escribe nada, así que no se repite lo de
-- pg_cron con el Disk IO (20261022230000_drop_reminder_push_on_time.sql).
--
-- Mismo criterio que sendDueReminders (lib/reminderPush.ts): pendiente, sin
-- avisar, con dueño y cuya hora (local de su tienda) ya llegó. Los muy
-- atrasados también cuentan: la app los marca como avisados sin mandarlos.
--
-- La llama el Worker con la llave publicable (rol anon) y su propia llave de
-- cron_keys: sin una llave válida responde error, nunca false, para que un
-- Worker mal configurado no deje de avisar en silencio (ante cualquier error
-- el Worker llama a la app como antes). Solo responde sí o no: no expone datos.
create or replace function public.reminders_due(p_key text)
 returns boolean
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.cron_keys
     where key_hash = encode(pg_catalog.sha256(pg_catalog.convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return exists (
    select 1
      from public.reminders r
      left join public.stores s on s.id = r.store_id
     where r.completado = false
       and r.push_sent = false
       and r.user_id is not null
       -- Cota amplia para el índice (la zona más adelantada es UTC+14)…
       and r.reminder_date <= (now() at time zone 'UTC') + interval '14 hours'
       -- …y luego la hora local de cada tienda
       and r.reminder_date <= (now() at time zone coalesce(nullif(s.timezone, ''), 'America/Mexico_City'))
  );
end
$function$;

revoke all on function public.reminders_due(text) from public, anon, authenticated;
grant execute on function public.reminders_due(text) to anon, service_role;
