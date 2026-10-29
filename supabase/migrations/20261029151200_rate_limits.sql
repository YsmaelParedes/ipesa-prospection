-- ════════════════════════════════════════════════════════════════════════════
-- Límites de intentos compartidos entre servidores
--
-- Los límites en memoria se reinician con cada arranque y cada instancia lleva
-- su propia cuenta. Para lo sensible (iniciar sesión, crear cuentas, mandar
-- correos, crear tiendas) la cuenta vive aquí, igual para todas las instancias.
--
--   · rate_limits es UNLOGGED: no escribe en el registro de cambios (casi no
--     gasta Disk IO). Si la base se reinicia de golpe se vacía, y no pasa nada:
--     solo se olvidan los intentos recientes.
--   · Las claves llegan ya resumidas desde el servidor (nunca un correo en claro).
--   · rate_limit_take suma un intento y dice si todavía cabe en la ventana.
--
-- Solo el servidor (service_role) la usa; anon y authenticated no tienen permisos.
-- ════════════════════════════════════════════════════════════════════════════

create unlogged table public.rate_limits (
  key          text primary key check (char_length(key) <= 200),
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

create or replace function public.rate_limit_take(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits         = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;

  -- Limpieza ocasional de ventanas viejas (la más larga que se usa es de un día)
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max;
end $$;
revoke all on function public.rate_limit_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, integer, integer) to service_role;
