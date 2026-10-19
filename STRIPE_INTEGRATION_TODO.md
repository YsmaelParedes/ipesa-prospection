# Stripe: pasos pendientes

Fuente única de lo que falta para cobrar con Stripe en Matices (planes Galón y Cubeta).

## Values to Replace

No queda ningún valor de ejemplo en el código. Los parámetros `sample_only` ya tienen valores reales:

**Files containing placeholders:**
- _(ninguno)_

| Field | Current Value | What to Set |
|-------|--------------|-------------|
| mode | `subscription` | Ya es el correcto (cobro mensual recurrente). |
| success_url | `${origin}/configuracion?tab=plan&pago=ok` | Ya es real: vuelve a Configuración → Plan. `origin` sale de `NEXT_PUBLIC_SITE_URL`. |
| cancel_url | `${origin}/configuracion?tab=plan` | Ya es real. |
| line_items[].price | ID leído de Stripe por lookup key (`galon_mensual` / `cubeta_mensual`) | No va en el código: crea en Stripe los precios con esos lookup keys (ver abajo). |

## Configured Parameters

Parámetros configurados en Checkout Studio, ya puestos en la llamada que crea la sesión.

**Files containing these parameters:**
- [app/api/billing/checkout/route.ts](app/api/billing/checkout/route.ts)

| Parameter | Value |
|-----------|-------|
| ui_mode | `hosted_page` (SDK `stripe` 23.0.0, ≥ 21) |
| billing_address_collection | `auto` |
| phone_number_collection | `{ enabled: false }` |
| automatic_tax | `{ enabled: true }` |
| allow_promotion_codes | `false` |
| payment_method_collection | `always` (solo aplica porque `mode` es `subscription`) |
| submit_type | `auto` |
| integration_identifier | `hosted_mobile_app_0002` |
| origin_context | `mobile_app` |

**Parámetros que se conservaron aunque no vienen de Checkout Studio** (quitarlos rompería el cobro):

| Parameter | Por qué se queda |
|-----------|------------------|
| customer | Una tienda = un cliente de Stripe; el portal y el webhook lo usan para ubicar la tienda. |
| client_reference_id, metadata, subscription_data.metadata | Ligan la suscripción con la tienda (`store_id`); sin ellos el webhook no sabría a qué tienda cambiarle el plan. |
| customer_update `{ address: 'auto' }` | Stripe lo exige cuando `automatic_tax` está encendido y la sesión usa un cliente existente. |

Se quitó `locale: 'es-419'`: Checkout toma el idioma del navegador.

## Setup

### 1. Variables de entorno (Vercel y `.env.local`; nunca en el chat ni en el código)

| Variable | Valor |
|----------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_…` en pruebas, `sk_live_…` en producción. Solo servidor. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` del endpoint de abajo (o el que imprime `stripe listen` en local). |
| `NEXT_PUBLIC_SITE_URL` | `https://crm-pinturas.vercel.app` (ya existe; arma las URL de regreso). |

No se necesita llave publicable: el pago es en la página de Stripe.

### 2. En el panel de Stripe (modo de prueba primero)

1. **Productos y precios:** "Matices Galón" y "Matices Cubeta", cada uno con un precio mensual en MXN y los *lookup keys* `galon_mensual` y `cubeta_mensual`.
2. **Stripe Tax** (porque `automatic_tax` está encendido):
   - Activa Stripe Tax y registra tu dirección de origen y tu registro de impuestos en México. Sin esto Checkout falla al crear la sesión.
   - Decide si el precio ya incluye IVA: en cada precio, `tax_behavior` = **inclusive** para que el precio publicado sea el final; con `exclusive` se suma el IVA al pagar. Los términos y la página de precios dicen "precio en pesos mexicanos"; ajústalos si eliges `exclusive`.
3. **Customer Portal:**
   - permitir cambiar entre Galón y Cubeta;
   - cancelar al final del periodo;
   - actualizar la tarjeta;
   - ver facturas.
4. **Smart Retries:** al agotar los reintentos, **cancelar la suscripción** (así la tienda baja a Litro).
5. **Webhook:** `https://crm-pinturas.vercel.app/api/webhooks/stripe` con estos eventos:
   - `checkout.session.completed`
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`
   - `charge.dispute.created`, `radar.early_fraud_warning.created`

### 3. Dependencias

Ya instalado: `stripe` 23.0.0 (`package.json`). La base de datos ya tiene la migración `20261018141228_stripe_plans.sql` aplicada.

## Archivos de la integración

```
app/api/billing/checkout/route.ts   Crea la sesión de Checkout (solo el dueño)
app/api/billing/portal/route.ts     Abre el portal de Stripe
app/api/billing/prices/route.ts     Precios de Galón y Cubeta (público)
app/api/billing/usage/route.ts      Uso del plan (Configuración → Plan)
app/api/webhooks/stripe/route.ts    Webhook firmado e idempotente
lib/stripe.ts                       Cliente y precios por lookup key
lib/stripeSync.ts                   Sincroniza la suscripción con la tienda
lib/billing.ts                      Reglas sin SDK (lookup key → plan, estado → plan)
supabase/migrations/20261018141228_stripe_plans.sql
```

## Cómo funciona

1. El dueño elige Galón o Cubeta en **Configuración → Plan**.
2. `POST /api/billing/checkout` crea o reutiliza el cliente de Stripe de la tienda y lo manda a Checkout.
3. Stripe cobra y avisa al webhook.
4. El webhook vuelve a leer la suscripción y llama a `apply_stripe_subscription`, que cambia el plan de la tienda. Así se aplica:
   - `active` / `trialing` / `past_due` → el plan pagado.
   - `canceled` / `unpaid` / `incomplete_expired` → Litro.
5. Cambios de plan, tarjeta, facturas y cancelación: **Administrar suscripción** abre el portal de Stripe.

## Pruebas

Solo con la tienda **Prueba**: el entorno local usa la base real; IPESA no se toca.

1. `stripe listen --forward-to localhost:3000/api/webhooks/stripe` y copia el `whsec_…` a `.env.local`.
2. Tarjetas de prueba (cualquier fecha futura y CVC):
   - `4242 4242 4242 4242` → pago correcto. La tienda pasa a Galón o Cubeta.
   - `4000 0025 0000 3155` → pide autenticación (3D Secure).
   - `4000 0000 0000 0341` → la tarjeta se guarda, pero el cobro siguiente falla. Prueba el aviso de pago fallido y la baja a Litro.
3. Desde el portal: cambia a Cubeta y luego cancela.
4. Reenvía un evento desde el panel de Stripe: no debe procesarse dos veces.
5. Al terminar: cambia a llaves `sk_live_…` y crea el webhook de producción.

## Siguientes pasos

- Ajustar precios: crea un precio nuevo y transfiere el lookup key; no requiere publicar código.
- Facturas fiscales (CFDI): hoy se piden por correo. Stripe manda recibos, no CFDI.
- Revisar los avisos de contracargos (`charge.dispute.created`) en /admin → Errores recientes.

## Recursos

- https://support.stripe.com
- https://docs.stripe.com/mcp
