-- Cotizaciones subidas (entrega 2): una cotización hecha en otro sistema o a
-- mano (PDF, JPG o PNG de hasta 10 MB) queda en la lista como «Cotización
-- subida», sin folio de Matices y con el total que escribe el vendedor.
--
-- 1. quotes: folio opcional (solo las subidas no lo tienen) y datos del archivo.
-- 2. Espacio privado «quote-files»: solo se lee con direcciones firmadas.
-- 3. send_quote / decide_quote: lo que registran en Comercial dice
--    «Cotización subida» cuando no hay folio (antes quedaría vacío).

-- ── 1. Folio opcional y archivo ────────────────────────────────────────────
alter table public.quotes alter column folio drop not null;
alter table public.quotes
  add column file_path text check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  add column file_name text check (char_length(file_name) between 1 and 200),
  add column file_mime text check (file_mime in ('application/pdf', 'image/jpeg', 'image/png')),
  add column file_size integer check (file_size between 1 and 10485760);
-- Una cotización es de Matices (con folio) o subida (con su archivo completo)
alter table public.quotes add constraint quotes_folio_or_file check (
  (folio is null) = (file_path is not null)
  and (file_path is null) = (file_name is null)
  and (file_path is null) = (file_mime is null)
  and (file_path is null) = (file_size is null)
);

-- ── 2. Espacio privado para los archivos ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-files', 'quote-files', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ── 3. Enviar: igual que antes, con el nombre de una subida ────────────────
create or replace function public.send_quote(
  p_store uuid, p_actor uuid, p_quote uuid, p_via text, p_kind text, p_today date
) returns public.quotes
language plpgsql security definer set search_path = '' as $$
declare
  q          public.quotes%rowtype;
  v_status   text;
  v_activity public.commercial_activities%rowtype;
begin
  if p_kind not in ('whatsapp', 'correo', 'visita') then
    raise exception 'Tipo de actividad inválido' using errcode = 'P0001';
  end if;
  select * into q from public.quotes where id = p_quote and store_id = p_store for update;
  if not found then raise exception 'Cotización no encontrada' using errcode = 'P0002'; end if;
  if q.status not in ('draft', 'sent') then
    raise exception 'Esta cotización ya se marcó como aceptada o rechazada' using errcode = 'P0001';
  end if;

  if q.status = 'draft' then
    q.valid_until := q.valid_until + (p_today - q.issued_on);
    q.issued_on := p_today;
  end if;

  if q.contact_id is not null then
    if q.activity_id is not null then
      update public.commercial_activities set quote_amount = q.total
       where id = q.activity_id and store_id = p_store;
    else
      select commercial_status into v_status from public.contacts where id = q.contact_id and store_id = p_store;
      v_activity := public.log_commercial_activity(
        p_store, p_actor, q.contact_id, p_kind, 'cotizacion',
        case when q.folio is null then 'Cotización subida' else 'Cotización #' || q.folio end,
        q.total, null, 'Confirmar la cotización', p_today + 2,
        case when v_status = 'cliente' then null else 'cotizacion' end, true);
      q.activity_id := v_activity.id;
    end if;
  end if;

  update public.quotes set
    status      = 'sent',
    issued_on   = q.issued_on,
    valid_until = q.valid_until,
    sent_at     = coalesce(sent_at, now()),
    sent_via    = p_via,
    activity_id = q.activity_id,
    updated_at  = now()
  where id = p_quote
  returning * into q;
  return q;
end $$;
revoke all on function public.send_quote(uuid, uuid, uuid, text, text, date) from public, anon, authenticated;
grant execute on function public.send_quote(uuid, uuid, uuid, text, text, date) to service_role;

-- ── 3. Aceptar o rechazar: igual que antes, con el nombre de una subida ────
create or replace function public.decide_quote(p_store uuid, p_actor uuid, p_quote uuid, p_status text, p_sale boolean, p_kind text, p_today date)
 returns public.quotes
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  q          public.quotes%rowtype;
  v_name     text;
  v_activity public.commercial_activities%rowtype;
begin
  if p_status not in ('accepted', 'rejected', 'sent') then
    raise exception 'Estado inválido' using errcode = 'P0001';
  end if;
  if p_kind not in ('whatsapp', 'correo', 'visita') then
    raise exception 'Tipo de actividad inválido' using errcode = 'P0001';
  end if;
  select * into q from public.quotes where id = p_quote and store_id = p_store for update;
  if not found then raise exception 'Cotización no encontrada' using errcode = 'P0002'; end if;
  if q.status = 'draft' then
    raise exception 'Primero envía la cotización' using errcode = 'P0001';
  end if;
  v_name := case when q.folio is null then 'Cotización subida' else 'Cotización #' || q.folio end;

  if p_status = 'accepted' and coalesce(p_sale, false) and q.contact_id is not null and q.sale_activity_id is null then
    v_activity := public.log_commercial_activity(
      p_store, p_actor, q.contact_id, p_kind, 'venta', v_name || ' aceptada', null, q.total,
      'Ofrecer recompra', p_today + 30, 'cliente', true);
    q.sale_activity_id := v_activity.id;
  end if;

  if p_status = 'rejected' and coalesce(p_sale, false) and q.contact_id is not null and q.lost_activity_id is null then
    v_activity := public.log_commercial_activity(
      p_store, p_actor, q.contact_id, p_kind, 'no_interesado', v_name || ' rechazada', null, null,
      'Volver a ofrecer', p_today + 90, 'no_interesado', true);
    q.lost_activity_id := v_activity.id;
  end if;

  update public.quotes set
    status           = p_status,
    decided_at       = case when p_status = 'sent' then null else now() end,
    sale_activity_id = q.sale_activity_id,
    lost_activity_id = q.lost_activity_id,
    updated_at       = now()
  where id = p_quote
  returning * into q;
  return q;
end $$;
revoke all on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) from public, anon, authenticated;
grant execute on function public.decide_quote(uuid, uuid, uuid, text, boolean, text, date) to service_role;
