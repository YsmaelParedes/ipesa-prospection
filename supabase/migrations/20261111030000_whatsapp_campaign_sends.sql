-- Campañas de WhatsApp por envío: cada vez que se manda una plantilla a un
-- grupo de contactos (normalmente un segmento) sus mensajes llevan el mismo
-- campaign_id y el nombre del envío. Así el historial muestra cada segmento
-- por separado aunque se manden seguidos con la misma plantilla. Los mensajes
-- anteriores quedan en null y se siguen agrupando por cercanía en el tiempo.

alter table public.whatsapp_messages
  add column campaign_id uuid,
  add column campaign_label text
    constraint whatsapp_messages_campaign_label_check check (char_length(campaign_label) <= 120);

create index whatsapp_messages_store_campaign_idx
  on public.whatsapp_messages (store_id, campaign_id)
  where campaign_id is not null;
