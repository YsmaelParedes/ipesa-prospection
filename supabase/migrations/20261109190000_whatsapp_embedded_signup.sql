-- WhatsApp: alta de la tienda en unos clics con Embedded Signup de Meta.
--
-- store_whatsapp guarda cómo se conectó el número:
--   · connection_method 'manual': el asesor puso las credenciales de la app
--     de Meta de la tienda (eventos por /api/webhooks/whatsapp/<clave>).
--   · 'embedded': la tienda lo conectó sola con la app de Matices; sus
--     eventos llegan al webhook central y se reparten por phone_number_id.
--   · coexistence: el número sigue en la app WhatsApp Business del celular.
--   · pin_enc: PIN de verificación en dos pasos (cifrado, como el token).
--   · history_*: importación única del historial de chats (coexistencia).
--   · setup_error: último paso que falló al conectar, para retomarlo.
--
-- whatsapp_messages.origin distingue lo que no salió de Matices:
--   · 'phone': lo mandó la tienda desde su celular (coexistencia).
--   · 'history': conversación anterior traída de WhatsApp Business.

alter table public.store_whatsapp
  add column connection_method text not null default 'manual'
    constraint store_whatsapp_connection_method_check check (connection_method in ('manual', 'embedded')),
  add column business_id text,
  add column coexistence boolean not null default false,
  add column pin_enc text,
  add column history_status text
    constraint store_whatsapp_history_status_check check (history_status in ('requested', 'importing', 'done', 'declined', 'failed')),
  add column history_requested_at timestamptz,
  add column history_imported integer not null default 0,
  add column setup_error text;

create index store_whatsapp_waba_idx on public.store_whatsapp (waba_id) where waba_id is not null;

alter table public.whatsapp_messages
  add column origin text
    constraint whatsapp_messages_origin_check check (origin in ('phone', 'history'));

-- Suma atómica de mensajes importados (los avisos del historial llegan en paralelo)
create or replace function public.add_whatsapp_history_imported(p_store_id uuid, p_count integer, p_done boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.store_whatsapp
     set history_imported = history_imported + greatest(p_count, 0),
         history_status = case
           when p_done then 'done'
           when history_status in ('requested', 'importing') then 'importing'
           else history_status
         end,
         updated_at = now()
   where store_id = p_store_id;
$$;

revoke all on function public.add_whatsapp_history_imported(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.add_whatsapp_history_imported(uuid, integer, boolean) to service_role;
