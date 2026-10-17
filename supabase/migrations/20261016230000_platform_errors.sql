-- Avisos de errores en producción: cada error distinto se guarda una vez (con su
-- contador) y la función decide si hay que avisar al dueño de la plataforma.
-- Solo el servidor (service_role) lee y escribe; ni anon ni authenticated.
create table if not exists public.platform_errors (
  id bigint generated always as identity primary key,
  fingerprint text not null unique,
  source text not null check (source in ('server','client','cron','webhook','render','whatsapp','test')),
  context text not null check (char_length(context) <= 200),
  message text not null check (char_length(message) <= 300),
  store_id uuid references public.stores(id) on delete set null,
  count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  resolved_at timestamptz
);
create index if not exists platform_errors_last_seen_idx on public.platform_errors (last_seen_at desc);
create index if not exists platform_errors_store_idx on public.platform_errors (store_id) where store_id is not null;
alter table public.platform_errors enable row level security;
revoke all on public.platform_errors from public, anon, authenticated;
grant select, update on public.platform_errors to service_role;

-- Guarda o suma un error y devuelve { stored, notify, id }.
-- Reglas anti-ruido: el mismo error avisa como máximo 1 vez por hora (o al
-- reaparecer tras marcarlo resuelto), en total 5 avisos cada 10 minutos, y desde
-- el navegador solo se aceptan 50 tipos de error nuevos por hora.
create or replace function public.report_platform_error(
  p_fingerprint text, p_source text, p_context text, p_message text, p_store uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.platform_errors%rowtype;
  do_notify boolean := false;
  new_client integer;
  recent_notified integer;
begin
  if p_fingerprint is null or length(p_fingerprint) < 8 or length(p_fingerprint) > 80 then
    raise exception 'Huella inválida' using errcode = 'P0001';
  end if;
  -- Una tienda que no existe (p. ej. una cookie alterada) se ignora, no hace fallar el reporte
  if p_store is not null and not exists (select 1 from public.stores where id = p_store) then
    p_store := null;
  end if;
  -- Dos reportes simultáneos del mismo error no avisan dos veces
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  delete from public.platform_errors where last_seen_at < now() - interval '30 days';

  select * into e from public.platform_errors where fingerprint = p_fingerprint;
  if not found then
    if p_source = 'client' then
      select count(*) into new_client from public.platform_errors
        where source = 'client' and first_seen_at > now() - interval '1 hour';
      if new_client >= 50 then return jsonb_build_object('stored', false, 'notify', false); end if;
    end if;
    insert into public.platform_errors (fingerprint, source, context, message, store_id)
      values (p_fingerprint, p_source, left(p_context, 200), left(p_message, 300), p_store)
      returning * into e;
    do_notify := true;
  else
    do_notify := e.resolved_at is not null or e.last_notified_at is null
                 or e.last_notified_at < now() - interval '1 hour';
    update public.platform_errors
      set count = count + 1, last_seen_at = now(), resolved_at = null,
          store_id = coalesce(store_id, p_store)
      where id = e.id;
  end if;

  if do_notify then
    select count(*) into recent_notified from public.platform_errors
      where last_notified_at > now() - interval '10 minutes' and id <> e.id;
    if recent_notified >= 5 then do_notify := false; end if;
  end if;
  if do_notify then
    update public.platform_errors set last_notified_at = now() where id = e.id;
  end if;
  return jsonb_build_object('stored', true, 'notify', do_notify, 'id', e.id);
end $$;
revoke all on function public.report_platform_error(text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.report_platform_error(text,text,text,text,uuid) to service_role;
