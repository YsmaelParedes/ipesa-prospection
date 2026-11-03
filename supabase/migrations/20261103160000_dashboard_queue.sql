-- Cola del Inicio calculada en la base.
--
-- Antes, /api/data/dashboard descargaba todos los contactos del usuario (y,
-- para el administrador sin equipo de ventas, todos los que no tienen
-- responsable) solo para contar la cola y mostrar 5 + 6 filas. En una tienda
-- con miles de contactos eran varias páginas de 1000 filas por cada visita al
-- Inicio. Ahora la base cuenta y devuelve solo esas filas.
--
-- Misma lógica que bucketOf/inQueue/queueCompare (lib/commercial.ts):
--   depurar: fuera de la cola y de próximos
--   0 vencido (fecha < hoy), 1 hoy (fecha = hoy), 2 nuevo (sin fecha ni actividad),
--   3 programado (fecha > hoy), 4 sin fecha (con actividad)
-- Cola = vencido, hoy y nuevo; dentro de cada grupo, los que no contestan
-- (no_answer_streak >= p_no_answer_limit) al final, luego por fecha y alta.
create or replace function public.dashboard_queue(
  p_store uuid,
  p_uid uuid,
  p_unowned boolean,
  p_today date,
  p_no_answer_limit integer default 3,
  p_top integer default 5,
  p_upcoming integer default 6
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with mine as (
    select id, name, company, commercial_status, next_action, next_action_at,
      last_activity_at, no_answer_streak, created_at,
      case
        when next_action_at < p_today then 0
        when next_action_at = p_today then 1
        when next_action_at > p_today then 3
        when last_activity_at is null then 2
        else 4
      end as bucket
    from public.contacts
    where store_id = p_store
      and commercial_status <> 'depurar'
      and (owner_id = p_uid or (p_unowned and owner_id is null))
  ),
  top as (
    select * from mine where bucket <= 2
    order by bucket, (no_answer_streak >= p_no_answer_limit), next_action_at, created_at, id
    limit p_top
  ),
  upcoming as (
    select * from mine where bucket = 3
    order by next_action_at, created_at, id
    limit p_upcoming
  )
  select jsonb_build_object(
    'count', (select count(*) from mine where bucket <= 2),
    'overdue', (select count(*) from mine where bucket = 0),
    'top', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company', company, 'commercial_status', commercial_status,
        'next_action', next_action, 'next_action_at', next_action_at, 'last_activity_at', last_activity_at)
      order by bucket, (no_answer_streak >= p_no_answer_limit), next_action_at, created_at, id) from top), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company', company, 'commercial_status', commercial_status,
        'next_action', next_action, 'next_action_at', next_action_at)
      order by next_action_at, created_at, id) from upcoming), '[]'::jsonb)
  )
$function$;

revoke all on function public.dashboard_queue(uuid, uuid, boolean, date, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.dashboard_queue(uuid, uuid, boolean, date, integer, integer, integer) to service_role;
