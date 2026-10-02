-- ════════════════════════════════════════════════════════════════════════════
-- Correcciones de datos (debug 2026-10-02)
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Teléfonos de contactos a 10 dígitos (formato canónico de la app: el
--    formulario, la importación y WhatsApp lo asumen). Había 242 guardados
--    como 52XXXXXXXXXX y 3 con prefijo 1 o un carácter invisible (U+202C);
--    por eso las respuestas de WhatsApp de esos contactos llegaban como
--    "número desconocido" y su conversación se partía en dos hilos.
--    No se pierde información: el país siempre es México (+52).
--    Los números cuyo formato normalizado ya existe en OTRO contacto
--    (duplicados reales) se dejan intactos para revisarlos a mano.
with norm as (
  select id, phone,
    case
      when regexp_replace(phone, '\D', '', 'g') ~ '^521[0-9]{10}$' then substr(regexp_replace(phone, '\D', '', 'g'), 4)
      when regexp_replace(phone, '\D', '', 'g') ~ '^52[0-9]{10}$'  then substr(regexp_replace(phone, '\D', '', 'g'), 3)
      when regexp_replace(phone, '\D', '', 'g') ~ '^1[0-9]{10}$'   then substr(regexp_replace(phone, '\D', '', 'g'), 2)
      else regexp_replace(phone, '\D', '', 'g')
    end as np
  from public.contacts
), safe as (
  select n.id, n.np
  from norm n
  where n.np <> n.phone
    and length(n.np) = 10
    and not exists (select 1 from norm o where o.np = n.np and o.id <> n.id)
)
update public.contacts c
set phone = s.np
from safe s
where c.id = s.id;

-- 2) El rol de administrador pasa de user_metadata (editable por el propio
--    usuario desde el navegador con supabase.auth.updateUser → escalada de
--    privilegios) a app_metadata (solo editable con service_role). Se copia
--    el rol actual para que ningún administrador pierda acceso.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'admin')
where raw_user_meta_data ->> 'role' = 'admin'
  and coalesce(raw_app_meta_data ->> 'role', '') <> 'admin';
