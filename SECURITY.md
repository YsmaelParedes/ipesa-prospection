# Seguridad — CRM Pinturas

**Última auditoría:** 2 de octubre de 2026 (multi-tienda / SaaS)
**Alcance:** rutas de `app/api/*`, `proxy.ts`, páginas y componentes, configuración (Next.js
y Vercel), dependencias, base de datos, Auth y Storage de Supabase, integración con WhatsApp
Cloud API y Web Push, y el aislamiento entre tiendas.
**Riesgo antes:** crítico · **Riesgo después:** bajo (quedan acciones manuales, abajo).

## Modelo de seguridad

### Aislamiento entre tiendas

- **Una tienda nunca ve datos de otra.** Cada tabla de negocio tiene `store_id` y cada ruta
  de la API obtiene la tienda con `requireStore()` (`lib/supabase-server.ts`): sesión válida
  (`getUser()`), membresía **activa** en `store_members`, rol suficiente, módulo encendido y,
  para escrituras, tienda con acceso completo. Todas las consultas filtran por ese
  `store_id`; ningún id que mande el navegador se usa sin comprobar que sea de la tienda.
- **La base también lo impide**: llaves foráneas compuestas `(store_id, id)` entre contactos,
  leads, actividades, recordatorios y mensajes, así que un registro no puede apuntar a datos
  de otra tienda aunque hubiera un error en el código.
- **La tienda activa es solo una preferencia** (cookie `crm_store`, `httpOnly`): se valida
  contra las membresías en cada petición; cambiarla a mano no da acceso a nada.
- **Roles por tienda**: dueño > administrador > vendedor. Un administrador no puede tocar al
  dueño ni a otros administradores; nadie puede cambiar su propio acceso.
- **Invitaciones**: token aleatorio de 256 bits que solo se muestra una vez (en la base queda
  su SHA-256), ligado a un correo, con vencimiento de 7 días, revocable y de un solo uso.
- **Credenciales de WhatsApp por tienda** cifradas con AES-256-GCM
  (`CREDENTIALS_ENCRYPTION_KEY`) usando el id de la tienda como dato autenticado: un valor
  copiado de otra tienda no se puede descifrar. Nunca regresan al navegador.
- **Webhooks por tienda** (`/api/webhooks/whatsapp/<clave>`): firma HMAC verificada con el
  App Secret de esa tienda; los eventos se guardan solo si el `phone_number_id` coincide con
  el número de esa tienda.
- **Solo consulta** cuando vence la prueba o el pago: las escrituras responden `402`.
- **Plataforma** (`/plataforma`, `/api/platform/*`): solo usuarios en `platform_admins`.
- **Contraseñas**: cambiarla desde la app exige la actual; desde un enlace de recuperación se
  permite durante 15 minutos con una cookie firmada (HMAC) ligada a ese usuario. Al cambiarla
  se cierran las demás sesiones.

### Base

- **El navegador nunca toca las tablas.** Toda lectura y escritura pasa por `app/api/*` con
  la llave `service_role`. `anon` y `authenticated` no tienen ningún privilegio sobre
  `public` (ni sobre objetos futuros); RLS está activo en todas las tablas y las tablas por
  usuario tienen políticas "solo tus filas" como segunda barrera.
- **Sesión validada en cada ruta** con `getUser()` (verificación real contra Supabase
  Auth), no con la cookie sola. `proxy.ts` solo decide redirecciones de páginas.
- **Rol de administrador en `app_metadata.role`**, que el usuario no puede editar. Solo un
  admin lo cambia (Configuración → Usuarios) y nadie puede quitarse a sí mismo el rol.
- **Validación por lista blanca** (`lib/validation.ts`): cada ruta declara los campos
  permitidos, su tipo y su longitud; lo demás se descarta (sin asignación masiva). Los
  errores internos se registran en el servidor y al cliente le llega un mensaje genérico.
- **Webhooks y cron autenticados**: firma HMAC-SHA256 de Meta (`X-Hub-Signature-256`) y
  `CRON_SECRET`, ambos comparados en tiempo constante. El cron falla cerrado si no hay
  secreto. Los avisos a la hora los dispara pg_cron con un pase aleatorio de un solo uso
  (`cron_tokens`, 244 bits, caduca en 5 min, solo `service_role` lo lee/borra), así que
  ningún secreto se copia a la base de datos.
- **Cabeceras** definidas en un solo lugar (`next.config.ts`): CSP estricta (sin
  `unsafe-eval` en producción, `object-src 'none'`, `frame-ancestors 'none'`), HSTS con
  preload, COOP, `nosniff`, `X-Frame-Options: DENY`, Permissions-Policy restrictiva y sin
  `X-Powered-By`.
- **CSRF**: cookies de sesión `SameSite=Lax` y, además, `proxy.ts` rechaza con 403 cualquier
  escritura a `/api/*` cuyo `Origin` no sea el propio dominio.
- **Límites de peticiones** en memoria: 10 intentos de login por IP cada 15 min y 120
  peticiones por IP por minuto en `/api/*` (webhooks y cron exentos porque van firmados).

## Revisión multi-tienda (2026-10-02)

Revisión adversarial del aislamiento entre tiendas, roles, invitaciones, webhooks y flujos de
acceso. Hallazgos y correcciones:

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | **Alta** | El webhook compartido aceptaba eventos sin firma si faltaba `WHATSAPP_APP_SECRET`, y los repartía a cualquier tienda por `phone_number_id`: se podían inyectar mensajes falsos o dar de baja contactos de otra tienda. | Falla cerrado sin el secreto y solo atiende el número del servidor. Las demás tiendas solo reciben eventos en su webhook propio, firmado con su App Secret. |
| 2 | Media | `safeNext` dejaba pasar `/\t/otro.com` (el navegador quita tabuladores) y rutas que al normalizarse quedan como `//otro.com`: redirección abierta tras iniciar sesión o abrir un enlace. | Se rechazan espacios, controles y `\`; la ruta se normaliza con `URL` y se vuelve a validar el origen. |
| 3 | Baja/Media | Un administrador podía reemplazar las credenciales de WhatsApp de la tienda por las de su propia cuenta de Meta. | Conectar o cambiar el número es solo del dueño (API y pantalla). |
| 4 | Baja | Rutas de `/api` terminadas en una extensión (`…/2221234567.png`) se saltaban el CSRF y el límite de peticiones del proxy. | El proxy siempre corre en `/api/:path*`; el parámetro de teléfono solo acepta dígitos. |
| 5 | Baja | Una invitación creaba la cuenta ya confirmada sin probar que el invitado controla ese correo; las invitaciones de un administrador seguían vigentes después de quitarlo; un administrador podía cancelar o rebajar invitaciones de administrador del dueño. | La cuenta de un invitado nace sin confirmar y la invitación se acepta al volver con el correo confirmado; al quitar, desactivar o bajar de rol a alguien se revocan sus invitaciones; las invitaciones de administrador solo las toca el dueño. |
| 6 | Baja | Con una sesión robada se podía llamar directo a Supabase Auth para cambiar la contraseña sin la actual. | Activar *Secure password change* en Supabase (acción manual). |
| 7 | Baja | El cron de recordatorios avisaba a usuarios que ya no estaban en la tienda o de tiendas suspendidas; cerrar sesión no daba de baja las notificaciones del dispositivo. | El cron solo avisa a miembros activos de tiendas vigentes; cerrar sesión elimina la suscripción push del dispositivo. |
| 8 | Baja | Borrar respuestas rápidas no respetaba el modo solo consulta; abrir un chat desde un enlace externo lo marcaba como leído. | `write` en esa ruta; marcar como leído requiere un encabezado que solo manda la bandeja. |

Pendiente aceptado: las membresías se guardan en caché hasta 10 s por instancia del servidor,
así que quitar a alguien puede tardar esos segundos en surtir efecto en todas las instancias.

## Hallazgos y correcciones (2026-10-02)

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | **Crítica** | El rol se leía de `user_metadata`, que cada usuario puede modificar desde el navegador con `supabase.auth.updateUser()`. Cualquier empleado podía volverse admin: ver los leads de todos, gestionar usuarios y mandar campañas desde el número del negocio. | El rol se lee solo de `app_metadata` (servidor y cliente). Migración que copia los admins existentes; el endpoint de usuarios escribe en `app_metadata` y limpia el valor viejo. |
| 2 | **Alta** | El webhook de WhatsApp aceptaba cualquier `POST` sin verificar la firma de Meta: se podían inyectar chats falsos, dar de baja contactos, alterar estados de entrega y disparar notificaciones al equipo. | Verificación HMAC-SHA256 del cuerpo crudo con `WHATSAPP_APP_SECRET` y comparación en tiempo constante. |
| 3 | **Alta** | `anon` tenía `INSERT/UPDATE/DELETE/TRUNCATE` en 5 tablas (`TRUNCATE` no pasa por RLS): la API REST de Supabase era una puerta trasera que se saltaba todas las reglas de la app. | `REVOKE ALL` a `anon`/`authenticated` en tablas, secuencias y funciones, también para objetos futuros. |
| 4 | **Alta** | `xlsx@0.18.5` con Prototype Pollution y ReDoS sin parche en npm (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). | Actualizado a SheetJS 0.20.3 desde el CDN oficial. `npm audit`: 0 vulnerabilidades. |
| 5 | Media | Con `CRON_SECRET` sin configurar, `/api/cron/reminders` quedaba abierto a cualquiera (comparación además no constante). | Falla cerrado + `timingSafeEqual`. |
| 6 | Media | Sin `SUPABASE_SERVICE_KEY` el servidor caía en silencio a la anon key. | Error explícito al arrancar la ruta; sin respaldo inseguro. |
| 7 | Media | El bucket público `whatsapp-media` aceptaba cualquier tipo y tamaño (p. ej. SVG/HTML con scripts). | Storage limitado a JPEG/PNG de 5 MB y la API valida los bytes reales del archivo (no solo el `Content-Type`). |
| 8 | Media | Cualquier usuario podía borrar o crear catálogos (tipos de cliente, canales). | Escritura de catálogos solo para admin. |
| 9 | Media | Dos CSP distintas (en `vercel.json` y `next.config.ts`) se aplicaban a la vez y sin `object-src`. | Una sola fuente de cabeceras, CSP revisada. |
| 10 | Baja | Next.js anterior a 16.3.1 con PostCSS vulnerable (GHSA-qx2v-qp2m-jg93). | Next.js 16.3.8. |
| 11 | Baja | Varias rutas devolvían `error.message` de la base al cliente y aceptaban campos sin límite de longitud. | `serverError()` genérico + esquemas con límites en todas las rutas de escritura. |
| 12 | Baja | Archivo local de Claude Code (`.claude/settings.local.json`) versionado con un token de la API DENUE de INEGI. | Sacado del repositorio e ignorado. **Rotar el token** (ver abajo). |

También se corrigió el cron, que comparaba la hora local de México guardada en
`reminder_date` contra la hora UTC (avisos con 6 h de desfase), y la normalización de
teléfonos que partía una misma conversación de WhatsApp en dos.

## Acciones manuales pendientes

0. **Multi-tienda**: configurar `CREDENTIALS_ENCRYPTION_KEY` (`openssl rand -base64 32`),
   `NEXT_PUBLIC_SITE_URL` y **`WHATSAPP_APP_SECRET`** (sin él, el webhook de la tienda
   original ahora rechaza los mensajes) en Vercel; SMTP propio, *Site URL*, *Redirect URLs*,
   plantillas de correo y *Secure password change* en Supabase Auth (ver README); y aplicar
   `supabase/migrations/20261003120100_multi_store_finalize.sql` en cuanto se despliegue el
   código nuevo.
1. **Configurar `WHATSAPP_APP_SECRET` en Vercel** (Meta → tu app → Configuración → Básica →
   Clave secreta). Desde la versión multi-tienda el webhook falla cerrado: mientras falte, los
   mensajes entrantes de la tienda original se rechazan.
2. ~~Confirmar `CRON_SECRET` en Vercel.~~ Verificado el 2026-10-02: el cron diario corre
   (los recordatorios quedan marcados como avisados).
3. **Activar "Leaked password protection"** en Supabase → Authentication → Sign In / Providers
   → Email (bloquea contraseñas filtradas en HaveIBeenPwned).
4. **Rotar el token de INEGI DENUE**: quedó en el historial de git aunque el archivo ya no
   esté en el repositorio.
5. Opcional: cambiar los límites en memoria por `@upstash/ratelimit` si el tráfico crece
   (los contadores actuales se reinician con cada arranque en frío).

## Reportar un problema

Escribe al administrador del proyecto. No abras issues públicos con detalles de una
vulnerabilidad.
