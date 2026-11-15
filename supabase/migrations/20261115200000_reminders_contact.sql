-- Fase 3 de la revisión de lógica: que ningún cliente se pierda en el flujo.
--
-- Los recordatorios guardaban al cliente solo como texto (lead_name): desde la
-- Agenda no se podía abrir su ficha y no cambiaba si se renombraba. Ahora se
-- ligan al contacto (contact_id). Si el contacto se borra, el recordatorio se
-- queda con el nombre en texto, como antes.

alter table public.reminders add column if not exists contact_id uuid;

alter table public.reminders drop constraint if exists reminders_contact_same_store_fkey;
alter table public.reminders add constraint reminders_contact_same_store_fkey
  foreign key (store_id, contact_id) references public.contacts(store_id, id) on delete set null (contact_id);

create index if not exists reminders_contact_idx on public.reminders (store_id, contact_id) where contact_id is not null;

-- Los recordatorios ligados a un lead viejo que ya apuntaba a su contacto
update public.reminders r
   set contact_id = l.contact_id
  from public.leads l
 where l.id = r.lead_id and l.store_id = r.store_id
   and l.contact_id is not null and r.contact_id is null;
