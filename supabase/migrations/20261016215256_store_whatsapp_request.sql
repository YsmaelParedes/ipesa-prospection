-- Solicitud de WhatsApp desde la tienda ("Quiero activarlo"): el dueño de la
-- plataforma la ve en su panel y la limpia al activar el servicio.
alter table public.stores add column if not exists whatsapp_requested_at timestamptz;
