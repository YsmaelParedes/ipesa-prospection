-- Revoca acceso directo al rol anon en todas las tablas.
-- El servidor usa service_role key que bypasea RLS, así que
-- las políticas USING(true) de las migraciones anteriores ya no importan,
-- pero este paso garantiza que la anon key no pueda leer/escribir nada.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Mantener acceso a authenticated por si en el futuro se usa Supabase Auth
-- (actualmente no se usa, pero no hace daño dejarlo)
