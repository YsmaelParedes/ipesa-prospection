-- ════════════════════════════════════════════════════════════════════════════
-- Eliminación de tiendas inactivas (Términos › Cancelación, Privacidad ›
-- Conservación). Solo tiendas en Litro sin suscripción ni cortesía, que nadie
-- haya usado en 6 meses. El cron diario (/api/cron/retention) avisa al dueño
-- por correo 30 y 7 días antes y después la elimina con todos sus datos.
--
--   · stores.last_seen_at: última vez que alguien del equipo abrió la tienda
--     (la sesión no renueva auth.users.last_sign_in_at, así que se guarda aquí).
--   · stores.deletion_scheduled_for / deletion_notices: fecha programada y
--     avisos enviados (0, 1 = a 30 días, 2 = a 7 días). Volver a usar la
--     tienda los borra.
--   · stores.retention_hold: el dueño de la plataforma la excluyó.
--   · store_deletions: constancia de cada tienda eliminada (sin datos de sus
--     clientes), porque platform_events se borra con la tienda.
--
-- Solo el servidor (service_role) las usa; anon y authenticated no tienen
-- ningún permiso, igual que el resto de las tablas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.stores
  add column last_seen_at           timestamptz,
  add column deletion_scheduled_for timestamptz,
  add column deletion_notices       smallint not null default 0 check (deletion_notices between 0 and 2),
  add column retention_hold         boolean  not null default false;

create table public.store_deletions (
  id            bigint generated always as identity primary key,
  store_id      uuid not null,
  store_name    text not null,
  store_slug    text not null,
  reason        text not null check (reason in ('inactive')),
  last_used_at  timestamptz,
  users_deleted integer not null default 0,
  deleted_at    timestamptz not null default now()
);
alter table public.store_deletions enable row level security;
revoke all on public.store_deletions from public, anon, authenticated;
grant select, insert, update on public.store_deletions to service_role;

-- Última señal de uso: entrada al CRM, inicio de sesión, contactos,
-- actividades comerciales o mensajes de WhatsApp (o el alta, si no hay nada).
create or replace function public.store_last_used_at(p_store uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select greatest(
    s.created_at,
    s.last_seen_at,
    (select max(c.updated_at) from public.contacts c where c.store_id = s.id),
    (select max(a.created_at) from public.commercial_activities a where a.store_id = s.id),
    (select max(w.created_at) from public.whatsapp_messages w where w.store_id = s.id),
    (select max(u.last_sign_in_at) from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = s.id)
  )
  from public.stores s where s.id = p_store
$$;

-- Protegida = no se elimina nunca por inactividad: paga con Stripe, tiene un
-- plan de paga o Interno sin cobro (cortesía), o la excluyó la plataforma.
-- Un Galón/Cubeta con paid_until vencido (más 3 días de gracia) ya es Litro.
create or replace function public.store_retention_protected(s public.stores)
returns boolean
language sql stable set search_path = ''
as $$
  select s.retention_hold
      or coalesce(s.subscription_status, '') in ('active', 'trialing', 'past_due')
      or s.plan = 'interno'
      or (s.plan in ('galon', 'cubeta') and (s.paid_until is null or s.paid_until + interval '3 days' > now()))
$$;

-- Estado de retención de todas las tiendas (panel del dueño y cron).
create or replace function public.store_retention_status(p_idle_days integer)
returns table(id uuid, name text, slug text, last_used_at timestamptz, idle boolean, protected boolean,
              deletion_scheduled_for timestamptz, deletion_notices smallint, admin_emails text[])
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.slug, l.at,
         l.at < now() - make_interval(days => p_idle_days),
         public.store_retention_protected(s),
         s.deletion_scheduled_for, s.deletion_notices,
         array(select u.email::text from public.store_members m join auth.users u on u.id = m.user_id
               where m.store_id = s.id and m.role = 'admin' and m.status = 'active' and u.email is not null)
  from public.stores s
  cross join lateral (select public.store_last_used_at(s.id) as at) l
$$;

-- Alguien abrió la tienda: se anota (una vez cada 12 h) y se cancela la
-- eliminación programada.
create or replace function public.touch_store_seen(p_store uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.stores
     set last_seen_at = now(), deletion_scheduled_for = null, deletion_notices = 0
   where id = p_store
     and (last_seen_at is null or last_seen_at < now() - interval '12 hours' or deletion_scheduled_for is not null)
$$;

-- Elimina una tienda inactiva. Vuelve a comprobar todo con la fila bloqueada
-- (alguien pudo entrar entre el escaneo y este momento) y deja constancia.
-- Devuelve las cuentas que se quedaron sin ninguna tienda (no administradores
-- de la plataforma) para que el servidor las borre de Auth.
create or replace function public.delete_inactive_store(p_store uuid, p_idle_days integer)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s public.stores;
  used timestamptz;
  members uuid[];
  orphans uuid[];
begin
  select * into s from public.stores where id = p_store for update;
  if not found then return jsonb_build_object('deleted', false, 'reason', 'not_found'); end if;
  used := public.store_last_used_at(p_store);
  if public.store_retention_protected(s) then return jsonb_build_object('deleted', false, 'reason', 'protected'); end if;
  if used >= now() - make_interval(days => p_idle_days) then return jsonb_build_object('deleted', false, 'reason', 'active'); end if;
  if s.deletion_notices < 2 or s.deletion_scheduled_for is null or s.deletion_scheduled_for > now() then
    return jsonb_build_object('deleted', false, 'reason', 'not_due');
  end if;

  select coalesce(array_agg(user_id), '{}') into members from public.store_members where store_id = p_store;
  delete from public.stores where id = p_store;

  select coalesce(array_agg(u), '{}') into orphans from unnest(members) u
   where not exists (select 1 from public.store_members m where m.user_id = u)
     and not exists (select 1 from public.platform_admins a where a.user_id = u);

  insert into public.store_deletions (store_id, store_name, store_slug, reason, last_used_at, users_deleted)
  values (s.id, s.name, s.slug, 'inactive', used, coalesce(array_length(orphans, 1), 0));

  return jsonb_build_object('deleted', true, 'orphans', to_jsonb(orphans));
end
$$;

revoke all on function public.store_last_used_at(uuid) from public, anon, authenticated;
revoke all on function public.store_retention_protected(public.stores) from public, anon, authenticated;
revoke all on function public.store_retention_status(integer) from public, anon, authenticated;
revoke all on function public.touch_store_seen(uuid) from public, anon, authenticated;
revoke all on function public.delete_inactive_store(uuid, integer) from public, anon, authenticated;
grant execute on function public.store_last_used_at(uuid) to service_role;
grant execute on function public.store_retention_protected(public.stores) to service_role;
grant execute on function public.store_retention_status(integer) to service_role;
grant execute on function public.touch_store_seen(uuid) to service_role;
grant execute on function public.delete_inactive_store(uuid, integer) to service_role;
