# IPESA CRM

CRM de prospección de **IPESA Pinturas Lomas de Angelópolis**: contactos, pipeline de leads,
recordatorios con notificaciones push, fórmulas de igualación de color y una bandeja de
**WhatsApp Business** integrada al CRM (chat, plantillas y campañas). Se instala como PWA
en el celular.

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Llave pública; el navegador solo la usa para iniciar sesión |
| `SUPABASE_SERVICE_KEY` | Sí | Llave `service_role`; **solo servidor**. Sin ella la API no arranca (no hay respaldo a la anon key) |
| `CRON_SECRET` | Sí | Protege `/api/cron/reminders`. Vercel la manda sola como `Authorization: Bearer …`. Sin ella el cron queda deshabilitado |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Para push | Generar con `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | No | Contacto que se envía a los servicios de push (`mailto:…`) |
| `WHATSAPP_ACCESS_TOKEN` | Para WhatsApp | Token permanente de un usuario del sistema en Meta Business |
| `WHATSAPP_PHONE_NUMBER_ID` | Para WhatsApp | Id del número emisor |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Para WhatsApp | Id de la cuenta (WABA): plantillas en vivo y salud del número |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Para WhatsApp | Texto libre que se captura también en Meta al registrar el webhook |
| `WHATSAPP_APP_SECRET` | **Muy recomendada** | Secreto de la app de Meta; verifica la firma `X-Hub-Signature-256` del webhook. Sin ella cualquiera podría inyectar mensajes falsos |
| `WHATSAPP_GRAPH_VERSION` | No | Versión de Graph API (por defecto `v21.0`) |

En **Configuración → WhatsApp** los administradores ven qué variables faltan, la
calificación de calidad del número y su límite de mensajes.

## WhatsApp

1. En [developers.facebook.com](https://developers.facebook.com) → tu app → WhatsApp →
   Configuración, registra el webhook:
   - URL: `https://<tu-dominio>/api/webhooks/whatsapp`
   - Token de verificación: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Suscríbete al campo **`messages`** (trae mensajes entrantes y estados de entrega).
2. Configura `WHATSAPP_APP_SECRET` (Configuración de la app → Básica → Clave secreta).

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

- `supabase/schema.sql`: foto del esquema actual (tablas, índices, vista, RLS y permisos).
- `supabase/migrations/`: cambios con fecha; los de `2026-10-02` ya están aplicados en
  producción.

Modelo de acceso: **toda** lectura y escritura pasa por las rutas de `app/api/*` con la
llave `service_role`; `anon` y `authenticated` no tienen permisos sobre `public`. Cada
ruta valida la sesión con `getUser()` y filtra por dueño (leads, actividades,
recordatorios). El rol de administrador vive en `app_metadata.role` y solo un admin puede
cambiarlo desde **Configuración → Usuarios**.

Los teléfonos se guardan con **10 dígitos** (formato nacional); a WhatsApp se envían como
`52` + 10 dígitos.

## Estructura

```
app/
  (app)/          páginas con sesión: dashboard, contactos, leads, recordatorios,
                  whatsapp, fórmulas, configuración
  api/            rutas del servidor (datos, WhatsApp, push, cron, webhooks, auth)
  login/          inicio de sesión
components/       AppShell (navegación), IpesaUI y componentes de WhatsApp
lib/              validación, teléfonos, Supabase, WhatsApp, push y reglas de dominio
proxy.ts          redirección a /login y límite de peticiones por IP en /api
public/           service worker, manifest e íconos de la PWA
supabase/         esquema y migraciones
```

Más detalles de seguridad en [SECURITY.md](SECURITY.md).
