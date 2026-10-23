-- Sistema comercial: zona de cada contacto (Puebla, San Andrés…) para filtrar
-- y, más adelante, repartir el trabajo entre vendedores. Las zonas son un
-- catálogo de la tienda, como los segmentos y los canales.

alter table public.contacts
  add column if not exists zone text check (char_length(zone) <= 60);

create index if not exists contacts_store_zone_idx on public.contacts (store_id, zone);

alter table public.app_config drop constraint if exists app_config_type_check;
alter table public.app_config
  add constraint app_config_type_check check (type = any (array['segment', 'canal', 'zone']));
