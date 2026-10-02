# IPESA CRM

CRM en la nube para las **tiendas IPESA Pinturas**: contactos, pipeline de leads,
recordatorios con notificaciones push, fórmulas de igualación de color y una bandeja de
**WhatsApp Business** integrada al CRM (chat, plantillas y campañas). Se instala como PWA
en el celular.

Es **multi-tienda (SaaS)**: cada sucursal se registra sola, prueba 14 días gratis y tiene
su propio equipo, logo, herramientas, catálogos y número de WhatsApp. La información de
cada tienda está aislada de las demás. La tienda original, **IPESA Lomas de Angelópolis**,
conserva todos sus datos.

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript |
| Datos y Auth | Supabase (Postgres + Auth + Storage) |
| Mensajería | WhatsApp Cloud API de Meta (Graph API, sin intermediarios) |
| Notificaciones | Web Push (VAPID) + service worker propio (`public/sw.js`) |
| Hosting | Vercel (incluye el cron diario de recordatorios) |

> Next.js 16 cambia varias convenciones respecto a versiones anteriores (por ejemplo,
> `middleware.ts` ahora es `proxy.ts`). Antes de tocar código revisa la guía incluida en
> `node_modules/next/dist/docs/`.

## Puesta en marcha

```bash
npm ci
# crea .env.local con las variables de abajo (o: vercel env pull .env.local)
npm run dev       # http://localhost:3000
npm run build     # compila para producción (lo mismo que corre Vercel)
```

## Variables de entorno

| Variable | Requerida | Para qué sirve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Llave pública; el navegador solo la usa para la sesión |
| `SUPABASE_SERVICE_KEY` | Sí | Llave `service_role`; **solo servidor**. Sin ella la API no arranca |
| `NEXT_PUBLIC_SITE_URL` | Sí | Dominio público (`https://…`, sin `/` final). Se usa en los enlaces de los correos, invitaciones y webhooks |
| `CREDENTIALS_ENCRYPTION_KEY` | Sí | Llave AES-256 para cifrar las credenciales de WhatsApp de cada tienda. Generar con `openssl rand -base64 32`. **No cambiarla** después: las credenciales guardadas dejarían de abrirse |
| `CRON_SECRET` | Sí | Protege `/api/cron/reminders` (Vercel la manda sola). Sin ella el cron queda deshabilitado |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Para push | Generar con `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | No | Contacto que se envía a los servicios de push (`mailto:…`) |
| `NEXT_PUBLIC_LEGAL_NAME` | Para vender | Razón social o nombre del responsable en Términos y Aviso de privacidad |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Para vender | Domicilio del responsable |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Para vender | Correo de contacto (derechos ARCO, activación de planes) |
| `WHATSAPP_*` | Solo tienda original | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`: el número que ya usaba IPESA Lomas de Angelópolis. Las tiendas nuevas capturan sus credenciales en la app |
| `WHATSAPP_GRAPH_VERSION` | No | Versión de Graph API (por defecto `v21.0`) |

## Supabase Auth (registro, confirmación y recuperación)

En Supabase → **Authentication**:

1. **URL Configuration** → *Site URL* = `NEXT_PUBLIC_SITE_URL` y en *Redirect URLs* agrega
   `https://<tu-dominio>/auth/confirm`.
2. **Emails → SMTP Settings**: configura un SMTP propio (Resend, SendGrid, Amazon SES…).
   El SMTP de prueba de Supabase solo envía a miembros del equipo y con un límite muy bajo.
3. **Emails → Templates** (para que los enlaces funcionen en cualquier dispositivo):
   - *Confirm signup*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/bienvenida`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
4. **Sign In / Providers → Email**: deja *Confirm email* activo y activa
   *Leaked password protection*.

## Cómo funciona el SaaS

| Paso | Dónde |
|---|---|
| La tienda descubre el producto | `/` (sin sesión) o `/inicio` |
| Crea su cuenta y confirma su correo | `/registro` → correo → `/auth/confirm` |
| Configura su sucursal (datos, logo, herramientas, equipo) | `/bienvenida` |
| Invita a su equipo con un enlace personal (vence en 7 días) | Configuración → Equipo → `/invitacion/<token>` |
| Conecta su número de WhatsApp Business | Configuración → WhatsApp |
| Prueba 14 días; después queda en **solo consulta** hasta activar | Configuración → Plan |
| Tú activas, extiendes o suspendes cada tienda | `/plataforma` (solo administradores de la plataforma) |

- **Roles por tienda**: *dueño* (todo, incluido nombrar administradores y desconectar
  WhatsApp), *administrador* (configura la tienda y ve el trabajo de todos) y *vendedor*.
  Una misma cuenta puede pertenecer a varias tiendas y cambiar entre ellas desde el menú.
- **Solo consulta**: con la prueba o el pago vencidos (3 días de gracia) el equipo puede ver
  y exportar, pero no registrar ni enviar; la API responde `402 STORE_READONLY`.
- **Administradores de la plataforma**: filas en la tabla `platform_admins`
  (`insert into public.platform_admins (user_id) values ('<uuid>');`).
- **Planes**: `lib/stores.ts` (`PLANS`, `TRIAL_DAYS`, `PAYMENT_GRACE_DAYS`). El cobro es
  manual por ahora; el panel de la plataforma registra la vigencia del pago.

## WhatsApp

Cada tienda conecta **su propio número** desde Configuración → WhatsApp (token permanente
de un usuario del sistema, *Phone number ID*, *WABA ID* y *App Secret*). La app verifica
las credenciales con Meta antes de guardarlas y las cifra con `CREDENTIALS_ENCRYPTION_KEY`;
nunca vuelven al navegador. Después se registra el webhook en Meta con los datos que muestra
esa misma pantalla:

- URL: `https://<tu-dominio>/api/webhooks/whatsapp/<clave-de-la-tienda>`
- Token de verificación: el que genera la app para esa tienda.
- Campo suscrito: **`messages`** (mensajes entrantes y estados de entrega).

La tienda original sigue usando las variables `WHATSAPP_*` y el webhook de siempre
(`/api/webhooks/whatsapp`), que reparte cada evento a su tienda por el `phone_number_id`.

Qué hace la sección **WhatsApp** del CRM:

- **Bandeja**: conversaciones en tiempo casi real con no leídos, búsqueda, filtros (no
  leídas / sin contacto), multimedia (imágenes, audio, video, documentos), palomitas de
  entregado/leído y aviso de la ventana de 24 h de Meta.
- **Ficha del CRM junto al chat**: guardar el número como contacto, crear leads, programar
  recordatorios de seguimiento y marcar si el cliente recibe campañas.
- **Respuestas rápidas** del equipo (admin las crea en Configuración; `{nombre}` se
  reemplaza por el nombre del cliente).
- **Campañas** (admin): plantillas aprobadas consultadas en vivo en Meta, filtros por tipo
  de cliente, vista previa, progreso real y pestaña de **Resultados** (entregados, leídos,
  respuestas, fallidos).
- **Reglas anti-bloqueo**: pausa de ~3 s entre envíos, tope de 200 plantillas por día, no
  repetir la misma plantilla a la misma persona en 7 días, y baja automática cuando el
  cliente escribe "BAJA", "STOP" o toca "Detener promociones".
- Notificación push al equipo cuando llega un mensaje (se puede desactivar por dispositivo).

## Base de datos

- `supabase/schema.sql`: foto del esquema multi-tienda (tablas, llaves, vista, funciones,
  RLS y permisos).
- `supabase/migrations/`: cambios con fecha. Las de `2026-10-02` y las de `2026-10-03`
  ya están aplicadas en producción **excepto**
  `20261003120100_multi_store_finalize.sql`, que se aplica justo después de desplegar esta
  versión (quita los valores por omisión de `store_id` que mantenían compatible el código
  anterior durante el cambio).

Modelo de acceso: **toda** lectura y escritura pasa por `app/api/*` con la llave
`service_role`; `anon` y `authenticated` no tienen permisos sobre `public`. Cada ruta
resuelve la tienda activa con `requireStore()` (`lib/supabase-server.ts`): valida la
sesión con `getUser()`, la membresía activa en `store_members`, el rol y el estado de la
tienda, y **todas** las consultas filtran por `store_id`. Las llaves foráneas compuestas
`(store_id, id)` impiden que un registro apunte a datos de otra tienda.

Los teléfonos se guardan con **10 dígitos** (formato nacional); a WhatsApp se envían como
`52` + 10 dígitos.

## Estructura

```
app/
  (app)/          páginas con sesión: dashboard, contactos, leads, recordatorios,
                  whatsapp, fórmulas, configuración y plataforma
  (auth)/         login, registro, recuperar, restablecer e invitación
  (legal)/        términos y aviso de privacidad
  inicio/         página de presentación (lo que ve quien entra sin sesión)
  bienvenida/     asistente de alta de una tienda
  auth/confirm/   destino de los enlaces de los correos
  api/            rutas del servidor (datos, tiendas, equipo, WhatsApp, push, cron, webhooks, auth)
components/       AppShell (navegación), AuthUI, IpesaUI y componentes de WhatsApp
lib/              tiendas y planes, Supabase, cifrado, invitaciones, validación, WhatsApp y push
proxy.ts          páginas públicas/privadas, CSRF y límite de peticiones por IP en /api
public/           service worker, manifest, íconos de la PWA y logos
supabase/         esquema y migraciones
```

Más detalles de seguridad en [SECURITY.md](SECURITY.md).
