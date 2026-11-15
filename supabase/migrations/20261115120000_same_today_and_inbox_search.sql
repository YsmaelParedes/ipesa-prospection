-- Fase 2 de la revisión de lógica: que los números cuadren entre pantallas.
--
-- 1. dashboard_queue (Inicio) cuenta con la MISMA regla que Comercial › Hoy:
--      pendientes = con fecha de hoy o vencida, míos o sin asignar (p_unowned),
--                   sin «Número incorrecto»  → count / overdue
--      nuevos     = sin fecha ni actividad, en «Prospecto» y con teléfono,
--                   míos o sin asignar       → fresh (aparte, ya no se suma)
--    La lista corta (top) trae primero los pendientes, como Hoy (por fecha), y
--    completa con nuevos: los míos primero. Próximos: solo los míos, como la Agenda.
--    Firma igual que antes (p_no_answer_limit ya no se usa: Hoy no reordena por eso).
-- 2. whatsapp_thread_list: la bandeja filtra y busca en la base, sobre TODOS
--    los chats (antes: «Sin contacto» solo entre los 100 más recientes y la
--    búsqueda entre 1,000, distinguiendo acentos).

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
  with base as (
    select id, name, company, commercial_status, next_action, next_action_at, last_activity_at,
           owner_id, phone, no_answer_streak, created_at
    from public.contacts
    where store_id = p_store
      and commercial_status <> 'depurar'
      and (owner_id = p_uid or (p_unowned and owner_id is null))
  ),
  due as (
    select * from base where next_action_at <= p_today
  ),
  fresh as (
    select * from base
    where last_activity_at is null and next_action_at is null and commercial_status = 'nuevo' and phone is not null
  ),
  candidates as (
    select d.*, 0 as grp, row_number() over (order by d.next_action_at, d.id) as pos from due d
    union all
    select f.*, 1 as grp, row_number() over (
      order by (f.owner_id is null),
               case when f.owner_id is not null then f.created_at end desc nulls last,
               f.no_answer_streak, f.created_at, f.id) as pos
    from fresh f
  ),
  top as (
    select * from candidates order by grp, pos limit p_top
  ),
  upcoming as (
    select * from base
    where owner_id = p_uid and next_action_at > p_today
    order by next_action_at, created_at, id
    limit p_upcoming
  )
  select jsonb_build_object(
    'count', (select count(*) from due),
    'overdue', (select count(*) from due where next_action_at < p_today),
    'fresh', (select count(*) from fresh),
    'top', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company', company, 'commercial_status', commercial_status,
        'next_action', next_action, 'next_action_at', next_action_at, 'last_activity_at', last_activity_at)
      order by grp, pos) from top), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'company', company, 'commercial_status', commercial_status,
        'next_action', next_action, 'next_action_at', next_action_at)
      order by next_action_at, created_at, id) from upcoming), '[]'::jsonb)
  )
$function$;

-- Chats de la bandeja con filtro y búsqueda en la base.
--   p_unread: solo con mensajes sin leer · p_unknown: solo los que no son contactos
--   p_words: palabras ya sin acentos (lib/contactSearch searchWords); cada una debe
--            aparecer en el contacto (search_text), el nombre de perfil o el número
--   p_digits: solo números → busca en el teléfono
--   p_before: paginación por fecha del último mensaje
create or replace function public.whatsapp_thread_list(
  p_store uuid,
  p_unread boolean default false,
  p_unknown boolean default false,
  p_words text[] default '{}',
  p_digits text default null,
  p_before timestamptz default null,
  p_limit integer default 101
)
returns setof public.whatsapp_threads
language sql
stable
set search_path to ''
as $function$
  select t.*
  from public.whatsapp_threads t
  left join lateral (
    -- El contacto del chat: el ya vinculado o el que tiene ese número (también en formatos 52/521)
    select c.id, c.search_text
    from public.contacts c
    where c.store_id = t.store_id
      and (c.id = t.contact_id or c.phone in (t.phone, '52' || t.phone, '521' || t.phone))
    order by (c.id = t.contact_id) desc nulls last
    limit 1
  ) c on true
  where t.store_id = p_store
    and (not coalesce(p_unread, false) or t.unread > 0)
    and (not coalesce(p_unknown, false) or c.id is null)
    and (p_before is null or t.last_at < p_before)
    and (p_digits is null or t.phone like '%' || p_digits || '%')
    and not exists (
      select 1 from unnest(coalesce(p_words, '{}'::text[])) w
      where (coalesce(c.search_text, '') || ' '
             || translate(lower(coalesce(t.profile_name, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou') || ' '
             || t.phone) not like '%' || w || '%'
    )
  order by t.last_at desc
  limit greatest(1, least(coalesce(p_limit, 101), 1001))
$function$;
revoke all on function public.whatsapp_thread_list(uuid, boolean, boolean, text[], text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.whatsapp_thread_list(uuid, boolean, boolean, text[], text, timestamptz, integer) to service_role;
