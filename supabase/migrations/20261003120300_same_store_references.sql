-- ════════════════════════════════════════════════════════════════════════════
-- Referencias siempre dentro de la misma tienda
--
-- Las llaves foráneas simples (lead → contacto, mensaje → contacto,
-- actividad/recordatorio → lead) permitirían ligar un registro de una tienda
-- con el de otra si alguien enviara el id ajeno. Con llaves compuestas
-- (store_id, id) la base lo rechaza aunque la aplicación fallara.
-- Aditivo: las llaves simples anteriores se retiran en el paso final.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts add constraint contacts_store_id_id_key unique (store_id, id);
alter table public.leads    add constraint leads_store_id_id_key    unique (store_id, id);

alter table public.leads
  add constraint leads_contact_same_store_fkey
  foreign key (store_id, contact_id) references public.contacts (store_id, id) on delete set null (contact_id);

alter table public.whatsapp_messages
  add constraint whatsapp_messages_contact_same_store_fkey
  foreign key (store_id, contact_id) references public.contacts (store_id, id) on delete set null (contact_id);

alter table public.lead_activities
  add constraint lead_activities_lead_same_store_fkey
  foreign key (store_id, lead_id) references public.leads (store_id, id) on delete cascade;

alter table public.reminders
  add constraint reminders_lead_same_store_fkey
  foreign key (store_id, lead_id) references public.leads (store_id, id) on delete cascade;
