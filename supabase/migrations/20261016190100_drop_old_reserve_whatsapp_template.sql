-- Versión anterior de la reserva (tope fijo de 200 y regla de 7 días), ya sin uso.
drop function if exists public.reserve_whatsapp_template(uuid,uuid,text,text,text,uuid,integer,integer,boolean);
