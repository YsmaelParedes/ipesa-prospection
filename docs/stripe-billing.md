# Stripe: sincronización y despliegue

Las correcciones requieren `20261019232657_stripe_billing_reliability.sql` y el código de esta revisión. La migración está preparada en el repositorio; no se aplica automáticamente a un proyecto remoto.

## Despliegue coordinado

1. Verificar en un entorno de pruebas con `npm run test:billing`, `npm run test:cache` y `npx tsc --noEmit --incremental false`.
2. Detener temporalmente la creación de nuevos Checkout en la versión anterior. No mantener instancias antiguas creando sesiones durante el cambio: desconocen los nuevos bloqueos.
3. Aplicar la migración y desplegar inmediatamente el código nuevo. La firma antigua de `apply_stripe_subscription` se elimina deliberadamente: los webhooks de instancias antiguas fallarán y Stripe podrá reintentarlos, en lugar de escribir sin bloqueo. No volver al código anterior manteniendo esta migración.
4. Restablecer Checkout y verificar los eventos pendientes en Stripe. Una respuesta `503` por evento/tienda ocupados es reintentable; no debe convertirse a `200` en un proxy.
5. Comprobar en modo de prueba: alta, renovación, fallo de cobro, recuperación del pago, cambio de plan y cancelación. Los tests locales usan PostgreSQL en memoria y Stripe simulado, no verifican las llaves ni los ajustes del Dashboard.

El webhook sigue requiriendo payloads **snapshot** y una versión compatible con `invoice.parent.subscription_details.subscription`. Suscribir los eventos indicados en `app/api/webhooks/stripe/route.ts`. Verificar también `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, el origen canónico `NEXT_PUBLIC_SITE_URL`, Stripe Tax y los productos permitidos en el portal.

## Precios históricos

`stripe_price_plans` conserva una asociación inmutable entre `price_id` y `galon`/`cubeta`. Los precios mensuales actuales se registran al consultar `/api/billing/prices` o iniciar Checkout. Las suscripciones también registran sus precios cuando todavía conservan un lookup key reconocido.

Antes de transferir un lookup key, comprobar que el precio anterior ya esté en esa tabla. Si una clave se transfirió **antes** de instalar esta corrección, recuperar el ID del precio anterior desde Stripe y registrar explícitamente el plan verificado:

```sql
-- Sustituir el ID y confirmar el plan en Stripe antes de ejecutar.
insert into public.stripe_price_plans(price_id, plan)
values ('price_ID_VERIFICADO', 'galon')
on conflict (price_id) do nothing;
```

No se infiere el plan desde `subscription.metadata.plan`: puede quedar desactualizado después de un cambio en el portal. Un precio desconocido en una suscripción activa produce un error reintentable, sin conceder acceso a un plan arbitrario. No se cambia un ID histórico de un plan a otro; crear un precio nuevo para eso.

## Garantías y recuperación

- Eventos: reclamo atómico por ID, bloqueo de cinco minutos y confirmación por token. Si el proceso cae después de aplicar el plan y antes de confirmar el evento, el reintento puede volver a sincronizarlo. Los avisos push y registros de auditoría no prometen entrega exactamente una vez.
- Tiendas: bloqueo compartido entre sincronización y Checkout durante dos minutos. La suscripción se vuelve a consultar **después** de adquirirlo. Cada escritura de estado comprueba su token y vencimiento en SQL; un proceso antiguo no puede sobrescribir al nuevo.
- Checkout: parámetros e identificador del intento persistidos antes de llamar a Stripe, con idempotencia y vencimiento fijo de una hora. Reintentar reutiliza el intento. Cambiar de plan vence el enlace anterior. Los enlaces abiertos de la implementación anterior se invalidan antes de crear otro.
- Una respuesta perdida se reconcilia por ID de sesión o por metadata del intento. Si no se puede determinar el resultado, se rechaza temporalmente otro pago. No borrar manualmente un intento pendiente sin verificar primero Stripe.
- Las suscripciones activas, en prueba, morosas, impagadas, pausadas o incompletas impiden iniciar otra. Se administran desde el portal. Esta revisión no cancela ni reembolsa suscripciones duplicadas preexistentes: deben revisarse individualmente.
- `past_due` conserva el plan durante los tres días de gracia existentes en la aplicación. Los avisos repetidos no extienden el plazo. Después se aplica Litro incluso si Stripe mantiene indefinidamente `past_due`. Un pago confirmado restablece el plan; `paused`, `unpaid` y `canceled` lo retiran. Las tiendas ya morosas reciben una única gracia al aplicar la migración si no tenían fecha.
- Las tablas nuevas tienen RLS y permisos exclusivos de servidor. Las funciones usan `SECURITY INVOKER` y no pueden ejecutarse como `anon` ni `authenticated`.

Las pruebas SQL ejecutan la migración real contra una estructura mínima de las tablas existentes. Verifican permisos, recuperación de bloqueos y escrituras rechazadas por tokens antiguos; no simulan la topología del despliegue ni reemplazan una prueba completa en Stripe test mode.
