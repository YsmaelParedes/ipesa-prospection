-- Fase 4 de la revisión de lógica: renombrar una opción de los catálogos
-- (segmento, canal o zona) y que los contactos que la tienen cambien con ella,
-- en la misma transacción. Antes solo se podía borrar y volver a crear, y los
-- contactos se quedaban con el nombre viejo (fuera de los filtros).

create or replace function public.rename_catalog_item(p_store uuid, p_id uuid, p_label text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  item public.app_config%rowtype;
  v_label text := btrim(coalesce(p_label, ''));
  v_max integer;
  n integer := 0;
begin
  select * into item from public.app_config where id = p_id and store_id = p_store for update;
  if not found then raise exception 'Opción no encontrada' using errcode = 'P0002'; end if;

  -- Los mismos largos que acepta la ficha del contacto (zona 60, los demás 100)
  v_max := case when item.type = 'zone' then 60 else 100 end;
  if v_label = '' or length(v_label) > v_max then
    raise exception 'Escribe un nombre de 1 a % caracteres', v_max using errcode = 'P0001';
  end if;
  if item.label = v_label then
    return jsonb_build_object('label', v_label, 'contacts', 0);
  end if;
  if exists (
    select 1 from public.app_config
    where store_id = p_store and type = item.type and id <> p_id and lower(label) = lower(v_label)
  ) then
    raise exception 'Ya existe «%»', v_label using errcode = 'P0001';
  end if;

  update public.app_config set label = v_label where id = p_id;
  if item.type = 'segment' then
    update public.contacts set segment = v_label where store_id = p_store and segment = item.label;
  elsif item.type = 'canal' then
    update public.contacts set acquisition_channel = v_label where store_id = p_store and acquisition_channel = item.label;
  elsif item.type = 'zone' then
    update public.contacts set zone = v_label where store_id = p_store and zone = item.label;
  end if;
  get diagnostics n = row_count;
  return jsonb_build_object('label', v_label, 'contacts', n);
end $function$;
revoke all on function public.rename_catalog_item(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.rename_catalog_item(uuid, uuid, text) to service_role;
