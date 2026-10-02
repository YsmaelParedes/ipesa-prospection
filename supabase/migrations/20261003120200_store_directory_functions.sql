-- ════════════════════════════════════════════════════════════════════════════
-- Funciones de solo servidor para la plataforma multi-tienda
--
-- auth.users no está expuesto por la API de Supabase y listUsers() devuelve
-- TODOS los usuarios de la plataforma; estas funciones devuelven solo lo que
-- cada pantalla necesita. SECURITY DEFINER con search_path vacío y EXECUTE
-- únicamente para service_role (anon/authenticated no pueden llamarlas).
-- ════════════════════════════════════════════════════════════════════════════

-- Equipo de una tienda: nombre, correo, rol y última conexión
create or replace function public.store_member_directory(p_store uuid)
returns table (
  user_id uuid, email text, display_name text, role text, status text,
  joined_at timestamptz, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         u.email::text,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email::text, '@', 1)),
         m.role, m.status, m.created_at, u.last_sign_in_at
  from public.store_members m
  join auth.users u on u.id = m.user_id
  where m.store_id = p_store
  order by m.created_at;
$$;

-- ¿Ya existe una cuenta con este correo? (invitaciones)
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email::text) = lower(trim(p_email)) limit 1;
$$;

-- Panel de la plataforma: todas las tiendas con su dueño y uso
create or replace function public.platform_store_overview()
returns table (
  id uuid, slug text, name text, city text, state text, phone text, status text, plan text,
  trial_ends_at timestamptz, paid_until timestamptz, created_at timestamptz,
  onboarding_completed_at timestamptz, platform_notes text,
  owner_email text, owner_name text, members int, contacts int, leads int,
  whatsapp_connected boolean, last_activity_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.slug, s.name, s.city, s.state, s.phone, s.status, s.plan,
         s.trial_ends_at, s.paid_until, s.created_at, s.onboarding_completed_at, s.platform_notes,
         o.email::text,
         coalesce(nullif(trim(o.raw_user_meta_data ->> 'display_name'), ''), split_part(o.email::text, '@', 1)),
         (select count(*)::int from public.store_members m where m.store_id = s.id and m.status = 'active'),
         (select count(*)::int from public.contacts c where c.store_id = s.id),
         (select count(*)::int from public.leads l where l.store_id = s.id),
         exists (select 1 from public.store_whatsapp w
                 where w.store_id = s.id and (w.credentials_source = 'env' or w.access_token_enc is not null)),
         greatest(
           (select max(l.created_at) from public.leads l where l.store_id = s.id),
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

revoke all on function public.store_member_directory(uuid)   from public, anon, authenticated;
revoke all on function public.auth_user_id_by_email(text)    from public, anon, authenticated;
revoke all on function public.platform_store_overview()      from public, anon, authenticated;
grant execute on function public.store_member_directory(uuid) to service_role;
grant execute on function public.auth_user_id_by_email(text)  to service_role;
grant execute on function public.platform_store_overview()    to service_role;
