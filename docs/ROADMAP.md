# Hoja de ruta: CRM como producto de renta mensual

Estado: **decisiones cerradas el 15 de octubre de 2026**. Nada de esto se ha construido todavía.
Cada etapa dice qué se implementa, qué cambia y si necesita migración de base de datos
(las migraciones solo se aplican con visto bueno explícito del dueño).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Modelo de ingreso | Renta mensual. No se vende el código. |
| Quién entra | Solo por invitación desde `/admin`. `/registro` se cierra o queda como lista de espera. |
| Prueba gratis | **Sin prueba gratis.** La tienda nace sin acceso hasta registrar su primer pago. Los pilotos reciben un pago de cortesía. |
| Planes y precio | **Sin precio general** (decisión del 15 de octubre). Cada tienda tiene su **precio mensual acordado**, que se negocia en la visita y se captura al invitarla. Un solo plan ("Profesional", límite de usuarios) sin pantalla de Planes. |
| Venta | En frío, visitando tiendas. Sin pagos en línea: todo pago se registra a mano en el panel. |
| Cuenta del dueño | La misma cuenta para `/admin` y para la tienda IPESA. Al iniciar sesión va directo a `/admin`; "Abrir mi tienda" pasa a IPESA. Más adelante, verificación en dos pasos. |
| Cobro | Manual con historial de pagos. Automático (Mercado Pago o Stripe) al llegar a unas 10 tiendas de paga. |
| Datos | Todas las tiendas, incluida IPESA, siguen en la misma base de datos. Se revisa el aislamiento. |
| Si un cliente cancela o no paga | Queda en **solo lectura indefinidamente** y puede descargar toda su información en Excel. **Sin borrado automático** (decisión del 15 de octubre): se borra solo si el dueño de la tienda lo pide por escrito. Consta en términos y privacidad. |
| Respaldos y hosting | Vercel Pro (US$20) y Supabase Pro (US$25) con el primer cliente de paga. Antes, respaldo manual mensual. |
| Fórmulas Vinipesa y Vintek | Se quedan, como módulo opcional por tienda, para poder quitarlas si hay un reclamo. Revisar derechos de marca antes de cobrar. |
| Nombre y dominio | Se definen antes del piloto. El nombre queda centralizado en un solo archivo. |
| Pilotos | 2 negocios conocidos, aparte de la tienda familiar. |
| Facturación (CFDI) | Se emite fuera del sistema. En cada pago solo se anota si pidió factura y su número. |
| Soporte | Botón "Ayuda" con WhatsApp y correo. Sin tickets ni chat interno. |
| WhatsApp (Bandeja, Campañas, Resultados) | **Exclusivo de la tienda IPESA Lomas de Angelópolis** (decisión final del 15 de octubre; reemplaza la de "instalación asistida"). **No se ofrece a tiendas nuevas**: nacen sin WhatsApp ni Campañas y nadie los enciende desde la app. El código se queda para IPESA. Sin botón `wa.me` en Leads ni Contactos. |
| Herramientas por tienda | **Sin interruptores**: cada tienda tiene siempre lo básico (Contactos, Leads, Agenda, Fórmulas). Se quitó Configuración → Herramientas y el paso del asistente. |
| Bot de IA | Fuera del producto. La rama `feature/bot-prueba` se borró (commit `ce77a8b`, recuperable un tiempo). |

## Etapas

### Etapa 1. Revisión de seguridad entre tiendas ✅ (15 de octubre de 2026)
- **Qué se hizo:** revisión solo de lectura de las 52 rutas de la API, las funciones de `lib/`, los permisos de la base, el almacenamiento de archivos, los webhooks y los crons.
- **Qué cambió:** nada en el código ni en la base.
- **Migración:** no.

**Resultado: el aislamiento entre tiendas está bien hecho en el código.**
- La llave pública del navegador no tiene permisos sobre ninguna tabla, vista ni función; RLS activo en todas las tablas.
- Todas las rutas validan sesión. Las consultas filtran por la tienda activa y los cambios y borrados por ID también.
- Las llaves compuestas de la base impiden que un lead, actividad, recordatorio o mensaje apunte a un registro de otra tienda.
- Cambiar de tienda exige ser miembro. Las invitaciones solo valen para el correo invitado y respetan el límite de usuarios del plan.
- Webhooks de WhatsApp: firma de Meta por tienda y solo eventos de su número. Crons: fallan cerrados sin su secreto.
- Archivos: logos e imágenes en carpeta por tienda; multimedia de WhatsApp solo si el mensaje es de la tienda; tipos peligrosos se fuerzan a descarga.
- Avisos push: solo al equipo activo de esa tienda.
- Cabeceras de seguridad (CSP, HSTS, anti-iframe).

**Hallazgos que bloquean la primera tienda ajena** (los tres se resuelven con la etapa 2):
1. **Teléfono único global** (`contacts_phone_key`, sigue en producción). Otra tienda no puede dar de alta un número que ya esté en IPESA (575 contactos) y el error le revela que ese número es cliente de otra tienda. Una importación con un solo número repetido falla completa.
2. **Catálogo único global** (`app_config_type_label_key`). Una tienda nueva nace sin segmentos ni canales: el alta los intenta crear, choca con los de IPESA y el error se ignora en silencio.
3. **`store_id` con valor por defecto = IPESA** en 7 tablas. Hoy todas las inserciones mandan su tienda (verificado), pero si algún cambio futuro la olvida, los datos caerían en IPESA sin aviso.

Hoy solo existe la tienda IPESA, así que nada de esto ha afectado a nadie.

**Menores (se atienden en otras etapas):**
- Un administrador de tienda puede encender WhatsApp y Campañas por su cuenta → etapa 6.
- Registro abierto: cualquiera puede abrir hasta 3 tiendas con prueba → etapa 5.
- La protección contra contraseñas filtradas de Supabase está apagada → activarla al pasar a Supabase Pro (etapa 8).
- Al quitar a alguien del equipo puede conservar acceso unos 10 segundos (caché por instancia). Aceptable.
- El límite de peticiones por IP vive en memoria de cada instancia. Suficiente para el MVP.
- Quedan 4 políticas RLS viejas sin efecto (no hay permisos públicos). Limpieza opcional.

### Etapa 2. Cerrar la migración multi-tienda ✅ (aplicada el 15 de octubre de 2026)

**Resultado:** aplicada en producción con visto bueno del dueño. Verificado después: 0 valores por defecto de `store_id`, 0 restricciones viejas, las 6 restricciones por tienda presentes, datos intactos (575 contactos, 14 leads, 375 mensajes, 43 recordatorios, 34 catálogos), las consultas usan los índices por tienda y los avisos de seguridad de Supabase no cambiaron.

- **Qué es:** `supabase/migrations/20261003120100_multi_store_finalize.sql` es el "paso 2 de 2" de la conversión a multi-tienda. El paso 1 ya está en producción. Este paso 2 quita lo que solo servía para no romper el código anterior:
  - el valor por defecto de `store_id` (hoy, si una inserción olvida la tienda, cae en silencio en IPESA; después falla);
  - los únicos globales de teléfono y de catálogos (hoy dos tiendas no pueden tener el mismo cliente);
  - las llaves y vistas viejas (`whatsapp_conversations`).
- **Qué cambia:** la base de datos. Hay que aplicarla antes de la primera tienda ajena, después de la etapa 1 y con un respaldo.
- **Verificado en la etapa 1:** el código ya no usa `whatsapp_conversations` y todas las inserciones mandan `store_id`, así que quitar el valor por defecto no rompe nada. Como solo existe la tienda IPESA, es el momento de menor riesgo para aplicarla.
- **Revisado:** sin triggers en las tablas, sin funciones de Supabase, los crons no insertan en estas tablas, ninguna vista depende de `whatsapp_conversations` y cada índice que se borra ya tiene su reemplazo por tienda.
- **Simulacro (15 de octubre, en una transacción deshecha, nada guardado):**

  | Prueba | Antes | Después |
  |---|---|---|
  | Teléfono de IPESA en otra tienda | Bloqueado | Se permite |
  | Mismo teléfono dos veces en la misma tienda | — | Bloqueado (correcto) |
  | Catálogo igual al de IPESA en otra tienda | Bloqueado | Se permite |
  | Contacto sin tienda | Cae en IPESA | Rechazado |

- **Después de aplicarla:** revisar los avisos de seguridad de Supabase y abrir Contactos, Leads, Agenda y WhatsApp en la tienda IPESA (solo lectura).
- **Migración:** sí. **Solo con visto bueno explícito.**

### Etapa 3. Panel `/admin` separado ✅ (15 de octubre de 2026, en la rama `feature/mvp-saas`)
- **Qué se implementó:** el panel del dueño (`app/admin/`, `components/AdminShell.tsx`) con su propio menú: **Resumen** (totales, "Requieren atención", "Altas recientes", "Sin uso en 14 días"; cada fila abre la ficha de la tienda) y **Tiendas** (lo que era `/plataforma`, con su ficha y acciones). Abajo, "Tu tienda" abre la tienda IPESA.
- **Qué cambió:** al iniciar sesión el dueño entra a `/admin` (la ruta de login devuelve su inicio); "Plataforma" salió del menú de la tienda; en la tienda, el selector de sucursal tiene "Panel del dueño" para volver; `/plataforma` redirige a `/admin/tiendas`; `/admin` responde 404 a cualquier cuenta que no sea administradora de la plataforma (validado en el servidor).
- **Mockup aprobado** el 15 de octubre. Pagos, Planes con precio y las cifras de dinero llegan en la etapa 4; Instalaciones, en la etapa 6.
- **Probado:** compilación, 4 pruebas nuevas (inicio de sesión del dueño y de otras cuentas, cálculos del Resumen) y las 16 anteriores; en el navegador, Resumen, ficha desde el Resumen, ida y vuelta panel ↔ tienda, celular y redirecciones sin sesión.
- **Migración:** no. Sin entrada en Novedades: el cambio solo lo ve el dueño de la plataforma y las Novedades las leen todas las tiendas.

### Etapa 4. Pagos e ingresos ✅ (15 de octubre de 2026, en la rama `feature/mvp-saas`)
- **Qué se implementa:** en la ficha de la tienda, "Registrar pago" (monto, meses, método, fecha, factura y número, nota) que extiende la vigencia en la misma operación y muestra hasta cuándo queda pagada; "Precio acordado" por tienda. Pantalla **Pagos** por mes (cobrado, número de pagos, con factura) con **Anular** (no se borra; la vigencia regresa a como estaba). En el Resumen: cobrado este mes, ingreso mensual acordado, por cobrar en 7 días y con adeudo. Bitácora de pagos, anulaciones, activar, suspender, plan y notas.
- **Qué cambia:** "Activar o renovar" se reemplaza por "Registrar pago"; "Sin vencimiento" queda como acción aparte (tienda propia).
- **Mockup:** mostrado el 15 de octubre (ficha con "Registrar pago" y pantalla Pagos).
- **Migración:** `20261015120000_store_payments.sql`: tablas `store_payments` y `platform_events`, columna `stores.monthly_price`, funciones `record_store_payment` y `void_store_payment`. No modifica datos existentes. **Solo con visto bueno explícito.**
- **Métodos de pago:** transferencia, efectivo, tarjeta, depósito, cortesía y otro.
- **Migración aplicada** en producción el 15 de octubre, con visto bueno, después de un simulacro deshecho (pago desde prueba, pago que se suma, anular en orden, restaurar vigencia, anular dos veces, método inválido, permisos de anon/authenticated). Datos existentes intactos.
- **Probado:** 9 pruebas nuevas (reglas de meses y montos, rutas de registrar y anular, ficha con precio y bitácora, cifras del Resumen) y las 20 anteriores; en el navegador, Resumen, ficha (validación sin enviar nada), Pagos y celular. No se registró ningún pago real: el primero lo hará el dueño.

### Etapa 5. Altas por invitación y sin prueba gratis ✅ (15 de octubre de 2026, en la rama `feature/mvp-saas`)
- **Qué se implementa:** crear la tienda desde `/admin` con su **precio mensual acordado** y mandar al dueño un correo de invitación para que ponga su propia contraseña. La tienda queda sin acceso hasta registrar el primer pago (o un pago de cortesía).
- **Qué cambia:** `/registro` se cierra o pasa a lista de espera; se quita "14 días de prueba" de la bienvenida y los textos. El código de prueba queda sin uso, no se borra.
- **Hecho:** "Nueva tienda" en Tiendas (datos, correo del dueño, precio acordado) → la tienda nace **Por activar** y se muestra el enlace del dueño (copiar o WhatsApp) con "Registrar primer pago". En la ficha de una tienda sin dueño, "Generar enlace nuevo". Resumen y Tiendas muestran "Por activar". `/registro` explica cómo pedir la invitación (WhatsApp o correo por variables de entorno) y su API responde 403; una cuenta sin tienda no puede abrir una (cierra el hueco de crear cuentas directo con la llave pública). Sin prueba gratis en `/inicio`, login, bienvenida, Plan, términos y privacidad (términos: sección "Alta, planes y pagos"; revisar con un abogado). Las sucursales que agregue un dueño también nacen Por activar.
- **Migración aplicada** (`20261015130000_invite_only_stores.sql`, con simulacro previo): estado `pending` (valor por omisión) e invitaciones con rol `owner`. Sin cambios a datos existentes.
- **Probado:** 8 pruebas nuevas (alta con invitación y deshacer si falla, enlace nuevo solo sin dueño, registro cerrado, sin tienda no se abre otra, contacto, conteos) y las 29 anteriores; en el navegador, páginas públicas sin "gratis", validación de "Nueva tienda" y pantallas de resultado y ficha con respuestas simuladas (no se creó ninguna tienda real).
- **Pendiente del dueño:** configurar `NEXT_PUBLIC_CONTACT_WHATSAPP` y `NEXT_PUBLIC_CONTACT_EMAIL` en Vercel (sin ellas `/registro` muestra un texto genérico).

### Etapa 6. WhatsApp solo para IPESA y sin interruptores ✅ (15 de octubre de 2026, en la rama `feature/mvp-saas`)
- **Cambio de plan:** se descartó la "instalación asistida" (interruptores en el panel, lista de 5 pasos, sección Instalaciones). WhatsApp y Campañas quedan **solo para IPESA**.
- **Qué se hizo:** las tiendas nuevas nacen sin WhatsApp ni Campañas (`DEFAULT_MODULES`; una tienda sin valor guardado queda sin WhatsApp). Se quitó Configuración → Herramientas y el paso "Elige las herramientas" del asistente (ahora: sucursal → logo → equipo). `PATCH /api/store` ya no acepta cambios de módulos (403) y las credenciales de WhatsApp (`/api/store/whatsapp`) exigen el módulo encendido. Sin WhatsApp en `/inicio` (funciones, imagen de la app, preguntas, datos), el panel de login, la descripción del sitio y del manifiesto, Plan (solo lo muestra a quien lo tiene) y términos/privacidad (solo como condicional). En tu panel, "WhatsApp conectado" solo aparece en la tienda que lo tiene. Novedades: "Configuración más simple" (lo ven los administradores de IPESA).
- **IPESA no cambia:** tiene sus módulos guardados como encendidos (verificado en la base); conserva WhatsApp, Campañas, Resultados y su pestaña de conexión.
- **Migración:** no (se escribió una y se descartó sin aplicarse). El valor por omisión de `stores.modules` en la base sigue con WhatsApp encendido, pero no se usa: el código siempre manda los módulos al crear una tienda.
- **Probado:** 3 pruebas nuevas (módulos de tiendas nuevas e IPESA, la tienda no cambia módulos, credenciales con módulo apagado) y las 37 anteriores; en el navegador, Configuración de IPESA sin Herramientas y con WhatsApp funcionando, y páginas públicas sin ofrecer WhatsApp.

### Etapa 7. Ciclo de vida de la cuenta ✅ (15 de octubre de 2026, en la rama `feature/mvp-saas`)
- **Cambio de plan:** sin borrado automático ni tarea de limpieza. Una tienda cancelada o vencida queda en solo lectura con su información.
- **Qué se hizo:** "Descarga tu información" en Configuración → Tienda (dueño/admin, también en solo lectura): un Excel con Contactos, Leads, Historial de leads, Agenda y Catálogos, pedido por partes de 1000 filas (el máximo de Supabase por consulta) a `/api/data/export` (cada respuesta queda muy por debajo del límite de 4.5 MB de Vercel; los ids de usuario se cambian por nombres). Botón **Exportar** en Leads (lo que estás viendo). Términos (Cancelación) y privacidad (Conservación) dicen que no se borra nada por nuestra cuenta, solo a petición escrita del dueño.
- **Corregido de paso:** Contactos, Leads (y su próximo seguimiento) y Agenda leían como máximo 1000 filas (límite de Supabase por consulta); una tienda más grande se veía y exportaba incompleta. Ahora leen todas las páginas (`lib/paged.ts`). IPESA tiene 575 contactos, así que no le afectaba todavía.
- **Migración:** no.

### Etapa 8. Listo para vender
- Nombre del producto centralizado en un archivo y dominio propio.
- Botón "Ayuda" con WhatsApp y correo.
- Términos de uso y aviso de privacidad actualizados.
- Fórmulas como módulo opcional por tienda.
- Vercel Pro y Supabase Pro, con respaldo comprobado.

### Etapa 9. Pilotos
- 2 negocios conocidos, activados con pago de cortesía. Se corrige lo que pidan antes de cobrar.

## Después del MVP
- Cobro automático con Mercado Pago o Stripe.
- Facturación CFDI integrada.
- Verificación en dos pasos para la cuenta del dueño.
- Dos planes (Básico y Pro).

## Riesgos que no hay que perder de vista
- Vercel Hobby prohíbe el uso comercial: pasar a Pro antes de cobrar.
- Supabase gratis: 500 MB para todas las tiendas y sin respaldos diarios automáticos.
- Aislamiento entre tiendas: es lo que más daña la reputación si falla (etapa 1).
- Derechos de marca sobre los catálogos de fórmulas.
- El dueño guarda datos de clientes de otros negocios: privacidad y regla de borrado por escrito.
