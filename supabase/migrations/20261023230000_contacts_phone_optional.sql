-- Contactos sin teléfono ("Para visita"): negocios que se visitan en persona
-- (vienen de DENUE con dirección pero sin teléfono). La llave única
-- (store_id, phone) sigue evitando teléfonos repetidos; varios contactos sin
-- teléfono no chocan porque NULL no se compara como igual.

alter table public.contacts alter column phone drop not null;
