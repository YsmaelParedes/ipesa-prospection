-- ════════════════════════════════════════════════════════════════════════════
-- Endurecimiento de seguridad (auditoría 2026-10-02)
--
-- La app accede a los datos EXCLUSIVAMENTE a través de sus API routes con el
-- cliente service_role. El navegador solo usa la anon key para Supabase Auth
-- (login/sesión), nunca para leer o escribir tablas. Por eso `anon` y
-- `authenticated` no necesitan ningún privilegio directo sobre el esquema
-- public: se revocan para que la API REST de Supabase no sea una puerta
-- alternativa que se salte las validaciones y permisos de la app (antes
-- `anon` tenía INSERT/UPDATE/DELETE/TRUNCATE en 5 tablas, contenido solo
-- por RLS — y TRUNCATE no pasa por RLS).
--
-- Compatible con el código en producción: service_role no se ve afectado.
-- ════════════════════════════════════════════════════════════════════════════

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Objetos que se creen en el futuro (por el rol postgres) tampoco heredan
-- privilegios para anon/authenticated.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Bucket público de imágenes de encabezado de plantillas: Meta solo acepta
-- JPEG/PNG de hasta 5 MB. Limitarlo en Storage evita que se suban SVG/HTML
-- (XSS en el dominio de storage) u otros archivos arbitrarios.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id = 'whatsapp-media';
