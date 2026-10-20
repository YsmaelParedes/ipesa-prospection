-- ════════════════════════════════════════════════════════════════════════════
-- Leads → Sistema comercial (datos). Requiere 20261020211955_commercial_system.
--
-- Cada lead queda como historial de su contacto (por contact_id o, si no lo
-- tiene, por teléfono en la misma tienda):
--   · una actividad "nota" con el resumen del lead (estado, monto y notas) en
--     su fecha de creación, con el resultado que corresponde a su estado;
--   · sus actividades (llamada, WhatsApp, visita) con resultado "contactado".
-- El contacto toma el estado del lead más reciente, su vendedor como
-- responsable (si sigue activo en el equipo) y, si el lead seguía abierto, una
-- próxima acción: su recordatorio pendiente más cercano o hoy.
-- Las tablas leads y lead_activities NO se borran: quedan como archivo.
-- ════════════════════════════════════════════════════════════════════════════

create temporary table tmp_lead_map on commit drop as
select l.id as lead_id, l.store_id, l.user_id, l.estado, l.monto, l.notas, l.created_at,
       coalesce(
         (select c.id from public.contacts c where c.store_id = l.store_id and c.id = l.contact_id),
         (select c.id from public.contacts c where c.store_id = l.store_id and c.phone = l.phone)
       ) as contact_id,
       case l.estado
         when 'Nuevo'                    then 'nuevo'
         when 'En seguimiento'           then 'interes'
         when 'Cotizado'                 then 'cotizacion'
         when 'Ganado / Venta realizada' then 'cliente'
         when 'Perdido'                  then 'no_interesado'
         else 'contactado'
       end as status,
       case l.estado
         when 'Nuevo'                    then 'contactado'
         when 'En seguimiento'           then 'interes'
         when 'Cotizado'                 then 'cotizacion'
         when 'Ganado / Venta realizada' then 'venta'
         when 'Perdido'                  then 'no_interesado'
         else 'contactado'
       end as result,
       l.estado not in ('Ganado / Venta realizada', 'Perdido') as is_open,
       exists (select 1 from public.store_members m
               where m.store_id = l.store_id and m.user_id = l.user_id and m.status = 'active') as owner_active
from public.leads l;

-- Resumen de cada lead como nota (con su resultado y montos)
insert into public.commercial_activities (store_id, contact_id, user_id, kind, result, note, quote_amount, sale_amount, created_at)
select m.store_id, m.contact_id, m.user_id, 'nota', m.result,
       left(concat_ws(E'\n', 'Lead anterior: ' || m.estado, nullif(btrim(m.notas), '')), 2000),
       case when m.result <> 'venta' then m.monto end,
       case when m.result = 'venta' then m.monto end,
       m.created_at
from tmp_lead_map m
where m.contact_id is not null;

-- Sus actividades registradas
insert into public.commercial_activities (store_id, contact_id, user_id, kind, result, note, is_followup, created_at)
select a.store_id, m.contact_id, a.user_id,
       case a.type when 'whatsapp' then 'whatsapp' when 'visit' then 'visita' when 'call' then 'llamada' else 'nota' end,
       'contactado',
       left(nullif(btrim(a.description), ''), 2000),
       true,
       coalesce(a.activity_date, a.created_at, now())
from public.lead_activities a
join tmp_lead_map m on m.lead_id = a.lead_id and m.store_id = a.store_id
where m.contact_id is not null;

-- El contacto toma el estado y responsable del lead más reciente
with latest as (
  select distinct on (m.store_id, m.contact_id) m.*
  from tmp_lead_map m
  where m.contact_id is not null
  order by m.store_id, m.contact_id, m.created_at desc
),
pending as (
  select r.store_id, r.lead_id, min(r.reminder_date)::date as due
  from public.reminders r
  where r.lead_id is not null and not r.completado
  group by r.store_id, r.lead_id
),
last_act as (
  select store_id, contact_id, max(created_at) as at
  from public.commercial_activities
  group by store_id, contact_id
)
update public.contacts c set
  commercial_status = l.status,
  owner_id          = coalesce(c.owner_id, case when l.owner_active then l.user_id end),
  next_action       = case when l.is_open then 'Dar seguimiento' else c.next_action end,
  next_action_at    = case when l.is_open then coalesce(p.due, current_date) else c.next_action_at end,
  last_activity_at  = greatest(c.last_activity_at, la.at),
  last_result       = l.result,
  last_note         = coalesce(left(nullif(btrim(l.notas), ''), 2000), c.last_note),
  updated_at        = now()
from latest l
left join pending p  on p.store_id = l.store_id and p.lead_id = l.lead_id
left join last_act la on la.store_id = l.store_id and la.contact_id = l.contact_id
where c.store_id = l.store_id and c.id = l.contact_id;

-- ── Panel del dueño de la plataforma: actividad comercial en lugar de leads ──
drop function public.platform_store_overview();
create function public.platform_store_overview()
returns table (
  id uuid, slug text, name text, city text, state text, phone text, status text, plan text,
  trial_ends_at timestamptz, paid_until timestamptz, created_at timestamptz,
  onboarding_completed_at timestamptz, platform_notes text,
  owner_email text, owner_name text, members int, contacts int, activities int,
  whatsapp_connected boolean, last_activity_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.slug, s.name, s.city, s.state, s.phone, s.status, s.plan,
         s.trial_ends_at, s.paid_until, s.created_at, s.onboarding_completed_at, s.platform_notes,
         o.email::text,
         coalesce(nullif(trim(o.raw_user_meta_data ->> 'display_name'), ''), split_part(o.email::text, '@', 1)),
         (select count(*)::int from public.store_members m where m.store_id = s.id and m.status = 'active'),
         (select count(*)::int from public.contacts c where c.store_id = s.id),
         (select count(*)::int from public.commercial_activities a where a.store_id = s.id),
         exists (select 1 from public.store_whatsapp w
                 where w.store_id = s.id and (w.credentials_source = 'env' or w.access_token_enc is not null)),
         greatest(
           (select max(a.created_at) from public.commercial_activities a where a.store_id = s.id),
           (select max(w.created_at) from public.whatsapp_messages w where w.store_id = s.id),
           (select max(o2.last_sign_in_at) from public.store_members m2 join auth.users o2 on o2.id = m2.user_id where m2.store_id = s.id)
         )
  from public.stores s
  left join lateral (
    select u.email, u.raw_user_meta_data from public.store_members m
    join auth.users u on u.id = m.user_id
    where m.store_id = s.id and m.role = 'owner'
    order by m.created_at limit 1
  ) o on true
  order by s.created_at desc;
$$;
revoke all on function public.platform_store_overview() from public, anon, authenticated;
grant execute on function public.platform_store_overview() to service_role;
