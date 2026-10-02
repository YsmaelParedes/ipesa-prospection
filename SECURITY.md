# Seguridad — IPESA CRM

**Última auditoría:** 2 de octubre de 2026
**Alcance:** rutas de `app/api/*`, `proxy.ts`, páginas y componentes, configuración (Next.js
y Vercel), dependencias, base de datos, Auth y Storage de Supabase, integración con WhatsApp
Cloud API y Web Push.
**Riesgo antes:** crítico · **Riesgo después:** bajo (quedan acciones manuales, abajo).

## Modelo de seguridad

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
  secreto.
- **Cabeceras** definidas en un solo lugar (`next.config.ts`): CSP estricta (sin
  `unsafe-eval` en producción, `object-src 'none'`, `frame-ancestors 'none'`), HSTS con
  preload, COOP, `nosniff`, `X-Frame-Options: DENY`, Permissions-Policy restrictiva y sin
  `X-Powered-By`.
- **CSRF**: cookies de sesión `SameSite=Lax` y, además, `proxy.ts` rechaza con 403 cualquier
  escritura a `/api/*` cuyo `Origin` no sea el propio dominio.
- **Límites de peticiones** en memoria: 10 intentos de login por IP cada 15 min y 120
  peticiones por IP por minuto en `/api/*` (webhooks y cron exentos porque van firmados).

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

1. **Configurar `WHATSAPP_APP_SECRET` en Vercel** (Meta → tu app → Configuración → Básica →
   Clave secreta). Mientras falte, el webhook acepta mensajes sin firma y lo registra como
   advertencia en los logs.
2. **Confirmar `CRON_SECRET` en Vercel.** Sin ella, los recordatorios diarios no se envían.
3. **Activar "Leaked password protection"** en Supabase → Authentication → Sign In / Providers
   → Email (bloquea contraseñas filtradas en HaveIBeenPwned).
4. **Rotar el token de INEGI DENUE**: quedó en el historial de git aunque el archivo ya no
   esté en el repositorio.
5. Opcional: cambiar los límites en memoria por `@upstash/ratelimit` si el tráfico crece
   (los contadores actuales se reinician con cada arranque en frío).

## Reportar un problema

Escribe al administrador del proyecto. No abras issues públicos con detalles de una
vulnerabilidad.
