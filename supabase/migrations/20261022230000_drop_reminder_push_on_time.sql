-- Se quitan los avisos de la Agenda a la hora exacta.
--
-- pg_cron corría cada minuto aunque no hubiera nada que avisar y cada vuelta
-- escribía 5 veces en cron.job_run_details: era casi todo lo que se escribía
-- en la base y agotaba el presupuesto de Disk IO del plan actual. Se volverá a
-- hacer con un plan mayor. El resumen de las 8:00 (cron diario de Vercel) sigue.
--
-- Deshace 20261003120500_reminder_push_on_time.sql. Nada más usaba pg_cron ni
-- pg_net, así que se quitan las extensiones (y con ellas su historial).

select cron.unschedule(jobname)
  from cron.job
 where jobname in ('crm-avisos-recordatorios', 'crm-limpieza-pases', 'crm-limpieza-historial-cron');

drop extension if exists pg_cron;
drop extension if exists pg_net;

drop table if exists public.cron_tokens;
