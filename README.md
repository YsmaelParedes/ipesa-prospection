# Matices

CRM en la nube para **tiendas de pintura** (producción: **https://www.matices.app**): contactos, pipeline de leads,
recordatorios con notificaciones push, fórmulas de igualación de color y una bandeja de
**WhatsApp Business** integrada al CRM (chat, plantillas y campañas). Se instala como PWA
en el celular.

Es **multi-tienda (SaaS)**: cada tienda crea su cuenta gratis, elige su plan y tiene su propio
equipo, logo y catálogos. La información de cada tienda está aislada de las demás. La
tienda original (la que existía antes de la versión multi-tienda) conserva todos sus datos.
**WhatsApp y Campañas vienen en el plan Cubeta**: las tiendas nuevas nacen con esos módulos
apagados y no hay interruptores en la app. El dueño o admin ve WhatsApp como **"Por activar"**
(menú y Configuración) con una presentación del servicio y el botón "Quiero activarlo"
(`POST /api/store/whatsapp-request` → `stores.whatsapp_requested_at`). La solicitud aparece
en el panel /admin (Resumen y Tiendas), donde un asesor activa WhatsApp y Campañas desde la
ficha de la tienda (`PATCH /api/platform/stores/[id]` con `{ whatsapp }`).

## Marca

- Nombre y frase: `lib/brand.ts` (`APP_NAME`, `APP_TAGLINE`). También están escritos a mano
  en `public/manifest.json` y `public/sw.js`, que son estáticos.
- Logo: `public/brand-mark.svg` (franjas de pintura en capas con la paleta de la app) y
  `components/Brand.tsx` (símbolo + nombre).
- Íconos de la PWA, favicon y ícono de avisos de Android: se generan desde el símbolo con
  `node scripts/generate-brand-icons.mjs`; después sube `CACHE_NAME` en `public/sw.js`.
- Paleta: variables de `:root` en `app/globals.css` (`--brand`, `--spectrum`, `--c-*`).

## Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 16 (App Router, Turbopack) · React 19 · TypeScript |
| Datos y Auth | Supabase (Postgres + Auth + Storage) |
| Mensajería | WhatsApp Cloud API de Meta (Graph API, sin intermediarios) |
| Notificaciones | Web Push (VAPID) + service worker propio (`public/sw.js`) |
| Hosting | Vercel (cron diario del resumen de la agenda) + Supabase pg_cron (avisos a la hora) |

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
| `CRON_SECRET` | Sí | Protege los crons: Vercel la manda sola a `/api/cron/agenda`. Sin ella el resumen diario queda deshabilitado |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Para push | Generar con `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | No | Contacto que se envía a los servicios de push (`mailto:…`) |
| `NEXT_PUBLIC_LEGAL_NAME` | Para vender | Razón social o nombre del responsable en Términos y Aviso de privacidad |
| `NEXT_PUBLIC_LEGAL_ADDRESS` | Para vender | Domicilio del responsable |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Para vender | Correo de contacto (derechos ARCO, facturas, sucursales adicionales) |
| `WHATSAPP_*` | Solo tienda original | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_APP_SECRET`: el número que ya usaba la tienda original. **Sin `WHATSAPP_APP_SECRET` el webhook rechaza los mensajes entrantes.** Las tiendas nuevas capturan sus credenciales en la app |
| `WHATSAPP_GRAPH_VERSION` | No | Versión de Graph API (por defecto `v21.0`) |
| `STRIPE_SECRET_KEY` | Para cobrar | Llave secreta de Stripe (`sk_test_…` en pruebas, `sk_live_…` en producción). Sin ella los planes de paga dicen "Disponible pronto" |
| `STRIPE_WEBHOOK_SECRET` | Para cobrar | Secreto de firma del webhook `https://<dominio>/api/webhooks/stripe` (`whsec_…`). Sin él se rechazan los avisos de Stripe |

## Supabase Auth (registro, confirmación y recuperación)

En Supabase → **Authentication**:

1. **URL Configuration** → *Site URL* = `NEXT_PUBLIC_SITE_URL` y en *Redirect URLs* agrega
   `https://<tu-dominio>/**`.
2. **Emails → SMTP Settings**: configura un SMTP propio (Resend, SendGrid, Amazon SES…).
   El SMTP de prueba de Supabase solo envía a miembros del equipo y con un límite muy bajo.
3. **Emails → Templates** (para que los enlaces funcionen en cualquier dispositivo):
   - *Confirm signup*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/bienvenida`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
4. **Sign In / Providers → Email**: deja *Confirm email* activo (las cuentas nuevas,
   también las de invitados, solo entran después de confirmar su correo) y activa
   *Leaked password protection* y *Secure password change*.

## Cómo funciona el SaaS

| Paso | Dónde |
|---|---|
| La tienda descubre el producto y crea su cuenta gratis | `/` (sin sesión) o `/inicio` → `/registro` → correo → `/auth/confirm` |
| Crea su tienda en el plan **Litro** y la configura (logo, catálogos) | `/bienvenida` (`POST /api/stores`, una tienda por cuenta) |
| Cambia a **Galón** o **Cubeta** pagando con tarjeta | Configuración → Plan → Stripe Checkout |
| Stripe confirma y el webhook cambia el plan | `/api/webhooks/stripe` → `apply_stripe_subscription` |
| Cambia de plan, tarjeta, facturas o cancela | Configuración → Plan → portal de Stripe |
| Invita a su equipo con un enlace personal (vence en 7 días) | Configuración → Equipo → `/invitacion/<token>` |
| Si deja de pagar o cancela, pasa al plan **Litro** (no se borra nada) | Automático (webhook) |

- **Planes** (`PLANS` en `lib/stores.ts`): **Litro** gratis (solo el dueño, 50 contactos,
  10 leads, sin WhatsApp), **Galón** (3 usuarios, sin límites, sin WhatsApp), **Cubeta**
  (5 usuarios con administradores y bandeja de WhatsApp) e **Interno**
  (cortesía de la tienda propia). El precio vive en Stripe (lookup keys `galon_mensual` y
  `cubeta_mensual`). Los límites de contactos y leads los hace cumplir la base
  (`plan_quota` + trigger `enforce_plan_quota`, mismos números que `PLANS`). En Litro, solo
  el dueño entra (`403 PLAN_OWNER_ONLY` para el resto). Al bajar de Cubeta a Galón se
  desactivan los usuarios más recientes que sobran y los administradores pasan a vendedores.
- **Campañas y Fórmulas** no se ofrecen en la plataforma: las fórmulas son de IPESA y las
  campañas se venden aparte. Las tiendas nuevas nacen sin esos módulos y no hay botón para
  activarlos; se encienden a mano en `stores.modules` (hoy solo IPESA). El envío a varias
  personas exige el módulo `campaigns`; una plantilla a un solo chat solo exige WhatsApp.
- **Plan efectivo** (`effectivePlan` en TS y `store_effective_plan` en SQL): un Galón o
  Cubeta asignado a mano vence con su `paid_until` (+3 días de gracia) y cuenta como Litro.
  Las suscripciones de Stripe dejan `paid_until` en null.
- **Alta con invitación desde `/admin`**: para casos especiales (otra sucursal, acuerdos);
  la tienda nace en Litro.
- **Roles por tienda**: *dueño* (todo lo de su tienda), *administrador*
  (configura la tienda y ve el trabajo de todos; solo en Cubeta e Interno) y *vendedor* (ve
  solo sus leads y su agenda). Si una cuenta pertenece a varias tiendas (por invitación),
  cambia entre ellas desde el menú.
- **Solo consulta**: solo en tiendas suspendidas o canceladas desde el panel; el equipo puede
  ver y exportar, pero no registrar ni enviar; la API responde `402 STORE_READONLY`.
- **Administradores de la plataforma**: filas en la tabla `platform_admins`
  (`insert into public.platform_admins (user_id) values ('<uuid>');`). Al iniciar sesión
  entran al **panel del dueño** (`/admin`: Resumen y Tiendas), separado del CRM; desde ahí
  "Tu tienda" abre las tiendas donde son miembros, y en la tienda el selector de sucursal
  tiene "Panel del dueño" para volver. Para cualquier otra cuenta `/admin` responde 404.
  `/plataforma` redirige a `/admin/tiendas`.
- **Pagos a mano (cortesías y acuerdos especiales)**: además de Stripe, una tienda puede tener
  **precio mensual acordado** (`stores.monthly_price`) y los pagos se registran a mano en su
  ficha (`/admin/tiendas`): monto, meses, método, fecha, factura y nota. La función
  `record_store_payment` guarda el pago y extiende `paid_until` en la misma transacción (se
  suma a lo pagado si sigue vigente). Un pago no se borra: se **anula**
  (`void_store_payment`, solo el más reciente vigente de cada tienda) y la vigencia regresa a
  como estaba, salvo que la tienda se haya suspendido o cancelado después. `/admin/pagos` muestra lo cobrado por mes; el Resumen, cobrado, ingreso
  mensual, por cobrar y adeudo. Todo queda en la bitácora `platform_events`. "Sin
  vencimiento" (tienda propia o acuerdo especial) es una acción aparte.
- Las invitaciones, nombrar administradores y reactivar usuarios respetan el plan efectivo.
- **Una sola tienda por cuenta**: `POST /api/stores` está cerrado y no hay "Agregar sucursal";
  otra sucursal se da de alta aparte desde el panel del dueño.

## WhatsApp

Cada tienda usa **su propio número**. Lo conecta el asesor desde el panel /admin, en la
ficha de la tienda → **Conexión de WhatsApp** (token permanente de un usuario del sistema,
*Phone number ID*, *WABA ID* y *App Secret*; `/api/platform/stores/[id]/whatsapp`). La
tienda no ve nada técnico: en Configuración → WhatsApp solo ve su número, la calidad y su
límite. La app verifica las credenciales con Meta antes de guardarlas y las cifra con
`CREDENTIALS_ENCRYPTION_KEY`; nunca vuelven al navegador. Después se registra el webhook en
Meta con los datos que muestra esa misma sección:

- URL: `https://<tu-dominio>/api/webhooks/whatsapp/<clave-de-la-tienda>`
- Token de verificación: el que genera la app para esa tienda.
- Campo suscrito: **`messages`** (mensajes entrantes y estados de entrega).

La tienda original sigue usando las variables `WHATSAPP_*` y el webhook de siempre
(`/api/webhooks/whatsapp`). Ese webhook solo acepta eventos firmados con
`WHATSAPP_APP_SECRET` y solo del número del servidor; conectar o cambiar el número de una
tienda lo puede hacer únicamente su dueño.

Qué hace la sección **WhatsApp** del CRM:

- **Bandeja**: conversaciones en tiempo casi real con no leídos, búsqueda, filtros (no
  leídas / sin contacto), multimedia (imágenes, audio, video, documentos), palomitas de
  entregado/leído y aviso de la ventana de 24 h de Meta.
- **Ficha del CRM junto al chat**: guardar el número como contacto, crear leads, programar
  recordatorios de seguimiento y marcar si el cliente recibe campañas.
- **Respuestas rápidas** del equipo (admin las crea en Configuración; `{nombre}` se
  reemplaza por el nombre del cliente).
- **Campañas** (admin): plantillas aprobadas consultadas en vivo en Meta, filtros por tipo
  de cliente y por historial (sin campañas todavía, respondieron, leyeron sin responder,
  límite de Meta…), vista previa y progreso real.
- **Resultados** (admin): historial con cada envío por separado (leídos, entregados,
  pendientes, no entregados y respuestas en 72 h). El detalle de cada campaña lista a cada
  destinatario con su estado y, si falló, el motivo (sin WhatsApp, límite de marketing de
  Meta…), si ya había fallado antes, y permite exportar a CSV, copiar los números y
  reintentar a quienes toparon con un límite temporal. No hay tabla de campañas: se arman
  agrupando los mensajes de una misma plantilla separados por menos de 30 min
  (`lib/campaignHistory.ts`). Los rechazos de Meta llegan por el webhook después del envío,
  por eso el resultado final tarda unos minutos. La vista **Por persona** clasifica cada
  número según su último mensaje de plantilla del último año (`lib/campaignPeople.ts`).
- **Números sin WhatsApp**: si lo último que respondió Meta sobre un número es que no tiene
  WhatsApp (error 131026), ya no se le envían plantillas: Campañas no deja elegirlo, el
  servidor lo omite (también en envíos desde Contactos) y la Bandeja lo marca y pide
  confirmación ("Intentar de todos modos"). No se borra porque puede ser un teléfono fijo.
  Vuelve a estar disponible solo si el cliente escribe o si un mensaje se le entrega.
- **Reglas de envío según la documentación oficial de Meta** (`lib/whatsappSafety.ts`):
  - **Límite real de Meta**: personas únicas contactadas fuera de la ventana de 24 h en 24 h
    móviles. El nivel (250, 2,000, 10,000, 100,000 o ilimitado) se lee en vivo de
    `whatsapp_business_manager_messaging_limit` y lo aplica la reserva atómica
    `reserve_whatsapp_template`. Quien escribió en las últimas 24 h no cuenta.
  - **Velocidad**: sin pausas artificiales. Se envía por lotes con poca concurrencia (Meta
    permite 80 mensajes/s por número) y se reintenta a los 4^X s ante 130429/131056.
  - **131049** (límite de marketing por persona): se omite a esa persona 24 h.
    **131050** o "BAJA", "STOP", "Detener promociones": baja automática.
  - Se consulta `health_status`: con BLOCKED no se envía. La campaña se detiene ante errores
    que afectan a todo el número o la plantilla (131048, 131031, 368, 131064, 132015, 190).
  - El selector muestra la calidad de cada plantilla y avisa si Meta la califica como baja.
- Notificación push al equipo cuando llega un mensaje (se puede desactivar por dispositivo).
- Enviar archivos desde el chat (clip 📎): fotos JPG/PNG, PDF, Word, Excel, PowerPoint, texto y
  video MP4 de hasta 4 MB (el límite lo pone Vercel: 4.5 MB por petición), con comentario
  opcional y dentro de la ventana de 24 h. Se suben a Meta (`POST /{phone_number_id}/media`),
  se envían por su id y se guardan en el historial como los recibidos (`lib/whatsappFiles.ts`,
  `/api/whatsapp/conversations/[phone]/media`). Se revisa el contenido real del archivo, no
  solo la extensión.

## Avisos (notificaciones push)

Cada persona los activa en cada dispositivo (Configuración → Mi cuenta, o la barra que
aparece en la app mientras estén apagados). En iPhone solo funcionan con la app agregada a
la pantalla de inicio (iOS 16.4+).

| Aviso | Quién lo dispara |
|---|---|
| A la hora de cada recordatorio | Supabase **pg_cron** revisa cada minuto si ya toca alguno y solo entonces llama a `/api/cron/reminders` con un pase de un solo uso (`cron_tokens`), sin secretos compartidos. Ver `supabase/migrations/20261003120500_reminder_push_on_time.sql` |
| Resumen de la agenda a las 8:00 | Cron diario de Vercel → `/api/cron/agenda` (con `CRON_SECRET`) |
| Mensaje nuevo de WhatsApp | El webhook, al guardar el mensaje |

Las suscripciones son por dominio: **si cambia el dominio de la app**, cada persona debe
volver a activar los avisos en el dominio nuevo. Las suscripciones del dominio anterior siguen
llegando mientras ese dominio responda. El job `crm-avisos-recordatorios` de pg_cron llama a
`https://www.matices.app/api/cron/reminders`; si cambia el dominio, actualiza su URL con
`cron.alter_job` (el 19 de octubre de 2026 `crm-pinturas.vercel.app` dejó de existir y se cambió).

## Base de datos

- `supabase/schema.sql`: foto del esquema multi-tienda (tablas, llaves, vista, funciones,
  RLS y permisos).
- `supabase/migrations/`: cambios con fecha, todos aplicados en producción.
  `20261003120100_multi_store_finalize.sql` se aplicó el 2026-10-15: quitó los valores por
  omisión de `store_id` (una inserción sin tienda ahora falla) y los únicos globales de
  teléfono y catálogos (cada tienda tiene los suyos).

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
                  whatsapp, fórmulas y configuración
  admin/          panel del dueño de la plataforma (Resumen, Tiendas y Pagos)
  (auth)/         login, registro, recuperar, restablecer e invitación
  (legal)/        términos y aviso de privacidad
  inicio/         página de presentación (lo que ve quien entra sin sesión)
  bienvenida/     asistente de alta de una tienda
  auth/confirm/   destino de los enlaces de los correos
  api/            rutas del servidor (datos, tiendas, equipo, WhatsApp, push, cron, webhooks, auth)
components/       AppShell (navegación), AdminShell (panel del dueño), AuthUI, Brand (logo), CrmUI y componentes de WhatsApp
lib/              tiendas y planes, Supabase, cifrado, invitaciones, validación, WhatsApp y push
proxy.ts          páginas públicas/privadas, CSRF y límite de peticiones por IP en /api
public/           service worker, manifest, íconos de la PWA, el símbolo de la marca y logos de tiendas
supabase/         esquema y migraciones
```

Más detalles de seguridad en [SECURITY.md](SECURITY.md).
