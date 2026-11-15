-- Fase 1 de la revisión de lógica: que borrar o quitar no se lleve datos.
--
-- 1. Borrar un contacto ya no borra sus actividades (llamadas, cotizaciones,
--    ventas): se quedan sin contacto (contact_id null) y con su nombre en
--    contact_name, para que los números del Inicio, Actividad diaria y
--    Acumulado no cambien al limpiar la base.
-- 2. Quitar a alguien del equipo suelta sus clientes (quedan «sin asignar»),
--    igual que ya pasaba al desactivarlo. Antes se quedaban a nombre de
--    alguien que ya no está y no le salían a nadie.
-- 3. Al quitar o desactivar, el administrador puede pasar esos clientes a
--    otra persona activa (manage_store_member: p_owner_to).
-- 4. store_owner_counts: cuántos clientes tiene cada quien (para preguntarlo).

-- ── 1. Actividades que sobreviven a su contacto ──────────────────────────────
alter table public.commercial_activities add column if not exists contact_name text;
alter table public.commercial_activities alter column contact_id drop not null;

alter table public.commercial_activities drop constraint commercial_activities_contact_same_store_fkey;
alter table public.commercial_activities add constraint commercial_activities_contact_same_store_fkey
  foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete set null (contact_id);

-- Antes de borrar el contacto, sus actividades guardan cómo se llamaba
-- (como se muestra en la app: la empresa o, si no tiene, el nombre).
create or replace function public.keep_activities_of_deleted_contact()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.commercial_activities
     set contact_name = coalesce(nullif(btrim(old.company), ''), old.name)
   where store_id = old.store_id and contact_id = old.id;
  return old;
end $function$;
revoke all on function public.keep_activities_of_deleted_contact() from public, anon, authenticated;

drop trigger if exists contacts_keep_activities on public.contacts;
create trigger contacts_keep_activities
  before delete on public.contacts
  for each row execute function public.keep_activities_of_deleted_contact();

-- ── 2. Quitar del equipo suelta sus clientes ─────────────────────────────────
-- (desactivar ya lo hace: trigger store_members_release_contacts)
create or replace function public.release_contacts_of_removed_member()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.contacts set owner_id = null
    where store_id = old.store_id and owner_id = old.user_id;
  return old;
end $function$;
revoke all on function public.release_contacts_of_removed_member() from public, anon, authenticated;

drop trigger if exists store_members_release_contacts_on_delete on public.store_members;
create trigger store_members_release_contacts_on_delete
  after delete on public.store_members
  for each row execute function public.release_contacts_of_removed_member();

-- ── 3. Pasar los clientes a otra persona al quitar o desactivar ──────────────
-- Mismo cuerpo de siempre más p_owner_to (opcional, al final: las llamadas
-- con los 7 argumentos de antes siguen funcionando).
drop function if exists public.manage_store_member(uuid, uuid, uuid, text, text, boolean, jsonb);
create function public.manage_store_member(
  p_store uuid, p_actor uuid, p_target uuid, p_role text, p_status text, p_remove boolean, p_plans jsonb,
  p_owner_to uuid default null
)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  s public.stores%rowtype;
  actor public.store_members%rowtype;
  target public.store_members%rowtype;
  limits jsonb;
  seats integer;
begin
  select * into s from public.stores where id = p_store for update;
  if not found then raise exception 'Tienda no encontrada' using errcode = 'P0002'; end if;
  select * into actor from public.store_members where store_id = p_store and user_id = p_actor and status = 'active';
  if not found or actor.role <> 'admin' then
    raise exception 'Sin permisos para administrar el equipo' using errcode = 'P0001';
  end if;
  select * into target from public.store_members where store_id = p_store and user_id = p_target for update;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;
  if p_target = p_actor then
    raise exception 'No puedes cambiar tu propio acceso' using errcode = 'P0001';
  end if;
  if p_role is not null and p_role not in ('admin', 'employee') then
    raise exception 'Rol inválido' using errcode = 'P0001';
  end if;
  if p_status is not null and p_status not in ('active', 'disabled') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;

  -- Sus clientes pasan a otra persona activa antes de quitarlo o desactivarlo
  -- (sin p_owner_to, los triggers los dejan «sin asignar»)
  if p_owner_to is not null then
    if not (coalesce(p_remove, false) or p_status = 'disabled') then
      raise exception 'Los clientes solo se pasan al quitar o desactivar a alguien' using errcode = 'P0001';
    end if;
    if p_owner_to = p_target or not exists (
      select 1 from public.store_members where store_id = p_store and user_id = p_owner_to and status = 'active'
    ) then
      raise exception 'Elige a alguien activo del equipo para pasarle los clientes' using errcode = 'P0001';
    end if;
    update public.contacts set owner_id = p_owner_to, updated_at = now()
      where store_id = p_store and owner_id = p_target;
  end if;

  if coalesce(p_remove, false) then
    delete from public.store_members where store_id = p_store and user_id = p_target;
  else
    limits := coalesce(p_plans -> public.store_effective_plan(s.plan, s.paid_until), p_plans -> 'litro');
    if p_role = 'admin' and target.role <> 'admin' and not coalesce((limits ->> 'allowAdmins')::boolean, false) then
      raise exception 'Tu plan incluye un solo administrador' using errcode = 'P0001';
    end if;
    if p_status = 'active' and target.status <> 'active' then
      if coalesce(p_role, target.role) = 'admin' and not coalesce((limits ->> 'allowAdmins')::boolean, false) then
        raise exception 'Tu plan incluye un solo administrador' using errcode = 'P0001';
      end if;
      select (select count(*) from public.store_members where store_id = p_store and status = 'active')
        + (select count(*) from public.store_invitations where store_id = p_store and accepted_at is null
           and revoked_at is null and expires_at > now()) into seats;
      if seats >= coalesce((limits ->> 'maxUsers')::integer, 1) then
        raise exception 'El equipo está completo para tu plan, contando invitaciones pendientes. Libera un lugar o cambia de plan.' using errcode = 'P0001';
      end if;
    end if;
    update public.store_members set role = coalesce(p_role, role), status = coalesce(p_status, status)
      where store_id = p_store and user_id = p_target;
  end if;
  if coalesce(p_remove, false) or p_status = 'disabled' or (target.role = 'admin' and p_role = 'employee') then
    update public.store_invitations set revoked_at = now()
      where store_id = p_store and invited_by = p_target and accepted_at is null and revoked_at is null;
  end if;
end $function$;
revoke all on function public.manage_store_member(uuid, uuid, uuid, text, text, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.manage_store_member(uuid, uuid, uuid, text, text, boolean, jsonb, uuid) to service_role;

-- ── 4. Clientes por responsable ──────────────────────────────────────────────
create or replace function public.store_owner_counts(p_store uuid)
 returns table (owner_id uuid, contacts bigint)
 language sql
 stable
 set search_path to ''
as $function$
  select c.owner_id, count(*) from public.contacts c
  where c.store_id = p_store and c.owner_id is not null
  group by c.owner_id
$function$;
revoke all on function public.store_owner_counts(uuid) from public, anon, authenticated;
grant execute on function public.store_owner_counts(uuid) to service_role;
