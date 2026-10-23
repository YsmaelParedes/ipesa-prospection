# Sistema comercial (reemplaza a Leads)

## Versión 2 (4.5.0, 23 de octubre de 2026) — lo vigente

La versión 1 "no se entendía": se rehízo desde el Excel *Sistema Comercial IPESA Lomas de Angelópolis* (entrevista con el dueño y mockup aprobado, celular y escritorio). Lo de abajo, a partir de "Estado", describe la versión 1 y queda como historia.

- **3 pantallas** (`app/(app)/comercial`):
  - **Hoy** (`GET /api/data/commercial`): mis seguimientos vencidos y de hoy, prospectos sin dueño con teléfono (de a 30, por zona o búsqueda) y "Para visita" (sin teléfono). Computadora: lista + ficha con el registro siempre visible; celular: tarjetas con Llamar / WhatsApp / Visita. Arriba, el avance del día contra la meta.
  - **Oportunidades** (`GET /api/data/commercial/opportunities`): cotizaciones abiertas, la más vieja primero, con cotizado y esperado (monto × 75 %). Ganada/Perdida abren el registro con Venta/No interesado.
  - **Equipo** (`GET/PATCH /api/data/commercial/control`, dueño/admin, Galón/Cubeta/Interno): cada vendedor contra su meta del día y del mes (días hábiles lunes a sábado), totales, resultados del día y actividad por segmento del mes; editar metas de la tienda o por persona.
- **Un solo avance:** Prospecto (`nuevo`) → Contactado (50 %) → Cotización (75 %) → Cliente, más No interesado (vuelve a 90 días) y Número incorrecto (`depurar`). `interes` ya no se usa (se muestra como Contactado).
- **Registro en 3 pasos** (`RegisterForm.tsx`): tipo (Llamada, WhatsApp, Visita) → 6 resultados (Sin contacto, Contactado, Cotización + monto, Venta + monto, No interesado, Número incorrecto) → nota y fecha sugerida. 3 "Sin contacto" seguidos = etiqueta "No contesta" y al final.
- **Dueños:** las zonas no se reparten (decisión del dueño). Todos ven los prospectos sin dueño; quien registra la primera actividad se queda con él (`p_claim` siempre verdadero en `log_commercial_activity`). El dueño reasigna desde la ficha.
- **Metas:** `stores.commercial_goals` guarda las de la tienda en la raíz y las propias en `byUser`. Por omisión, las del Excel: 30 llamadas, 15 efectivos, 6 cotizaciones, 10 seguimientos, 2 ventas.
- **Datos nuevos:** `contacts.zone` + catálogo de zonas en Configuración (migración `20261023195916_commercial_zones`) y teléfono opcional para "Para visita" (`20261023203612_contacts_phone_optional`).
- **Se quitaron:** las 7 pestañas (Resumen, Hoy, Seguimiento, Actividades, Base comercial, Alta, Control diario) y las observaciones del día. Base comercial = Contactos (con filtro de zona); Alta = "+ Nuevo" (zona obligatoria si la tienda tiene zonas).

---

Estado: **implementado el 20 de octubre de 2026 (versión 4.0.0) sin la geolocalización**, por decisión del dueño. Rama `feature/sistema-comercial`.

**Qué quedó distinto al plan original:**
- **Sin distancia ni coordenadas:** la cola ordena a los nuevos por antigüedad y se filtra por colonia. La geolocalización sigue descrita abajo por si se retoma.
- **Cola del dueño:** con reparto (Galón, Cubeta, Interno) ve sus propios contactos; los que no tienen responsable están en "Sin asignar". En Litro (sin reparto) su cola incluye también los sin asignar. Puede ver la cola de cualquier vendedor, pero solo el responsable registra; al registrar en uno sin asignar, se queda con él.
- **Contacto nuevo:** quien lo da de alta a mano queda como responsable; los importados quedan sin asignar.
- **"No interesado":** se le pone fecha a 90 días ("Volver a ofrecer") en vez de una columna aparte para ocultarlo.
- **Ya cambiados:** Inicio (llamadas para hoy, cotizaciones y ventas del mes, resultados), Agenda (muestra las llamadas de hoy y vencidas), ficha de Contactos y de WhatsApp (estado comercial), buscador, exportación ("Historial comercial") y panel `/admin` (actividades en lugar de leads).
- **Pestañas (como las hojas del Excel, aprobadas en mockup el 20 de octubre):** Resumen (tablero; el dueño entra aquí), Hoy (meta del día + cola en tarjetas con resultado a un toque; el vendedor entra aquí), Seguimiento (tablero por etapa), Actividades (bitácora), Base comercial (con "Por depurar", "Sin asignar", programados y clientes como filtros), Alta de prospectos y Control diario (con observaciones del día).
- **Datos agregados del Excel:** prioridad (alta/media/baja), potencial mensual, origen y observaciones del día (migración `20261020220024_commercial_fields`). La probabilidad sale de la etapa: contactado 10 %, interés 25 %, cotización 50 %.
- **Pendiente:** el sitio público (portada y funciones) todavía muestra la demo del tablero de Leads; se rehace aparte, con mockup.

## Por qué
Leads se queda corto para el vendedor de mostrador o el telefonista: no tiene una cola de llamadas, ni resultados con su próxima fecha, ni metas diarias. El Excel "Sistema Comercial Orizaba/Córdoba (v12)" se toma **solo como estructura**:
- base maestra única;
- actividades con resultado;
- seguimiento con próxima fecha;
- control diario con metas;
- tablero.

Sus datos no se usan: son de otra ciudad y no traen dirección, colonia ni distancia.

El sistema vive **sobre Contactos**, sin una segunda base. Se prueba primero en IPESA Lomas de Angelópolis (plan Interno) y después va a las demás tiendas.

## Decisiones

| Tema | Decisión |
|---|---|
| Excel | Solo la estructura; no se importan sus datos. |
| Reparto | Cada vendedor trabaja **sus propios** contactos (responsable por contacto). Contactos sigue compartido para consulta. |
| Distancia | Geolocalizar cada dirección una vez con OpenStreetMap (gratis). Distancia en línea recta a la tienda. |
| Planes | **Galón y Cubeta:** completo. **Litro:** versión básica (cola, registro de llamada, próxima fecha y notas). Sin reparto, metas, control diario, tablero ni distancia. |
| Leads | Se quita la sección. Las tablas `leads` y `lead_activities` quedan como archivo de solo lectura; no se borran. |

## Datos (todo con `store_id` y llaves compuestas por tienda, como las actuales)

**`contacts`, columnas nuevas:**

| Columna | Para qué |
|---|---|
| `owner_id` | Responsable (vendedor). Vacío = "Sin asignar". |
| `commercial_status` | Nuevo, Contactado, Interés, Cotización, Cliente, No interesado o Por depurar. |
| `next_action` | Qué sigue con este contacto. |
| `next_action_at` | Cuándo. |
| `last_activity_at` | Fecha de la última llamada o actividad. |
| `no_answer_streak` | Llamadas seguidas sin respuesta. |
| `snooze_until` | Oculta al "No interesado" de la cola durante 90 días. |
| `colonia`, `lat`, `lng` | Ubicación. |
| `geo_status`, `geo_at` | Estado de la geolocalización (pendiente, ok, no encontrada) y cuándo se hizo. |

**Tabla nueva `commercial_activities`:**
- contacto, usuario, tipo (llamada, WhatsApp o visita);
- resultado, nota;
- monto cotizado, monto vendido;
- próxima acción y su fecha;
- fecha de registro.

**`stores`:** `lat` y `lng` de la tienda, más `commercial_goals` (jsonb). Metas por defecto, cada tienda las ajusta:

| Meta diaria por persona | Valor |
|---|---|
| Llamadas | 25 |
| Contactos efectivos | 12 |
| Cotizaciones | 5 |
| Seguimientos | 10 |
| Ventas | 2 |

## Reglas de resultado (`lib/commercial.ts`, compartido por el navegador y el servidor)

| Resultado | Próxima fecha sugerida | Estado del contacto |
|---|---|---|
| No contesta | +1 día | Sin cambio. Al 3.er intento seguido baja de prioridad |
| Contactado | +3 días | Contactado |
| Interés | +3 días | Interés |
| Cotización enviada | +2 días (pide monto) | Cotización |
| Venta | +30 días (recompra) | Cliente |
| Reprogramar | La elige el vendedor | Sin cambio |
| No interesado | Sin fecha; vuelve en 90 días | No interesado |
| Número equivocado | Sin fecha | Por depurar |

La fecha sugerida siempre se puede cambiar. **Contacto efectivo** = cualquier resultado distinto de "No contesta" y "Número equivocado".

## Calidad de la base (`lib/address.ts`, funciones puras con pruebas)
- **Dirección válida:** tiene calle y número real. "0", "S/N" o sin número no cuentan.
- **Teléfono válido:** 10 dígitos, con `normalizePhone` de `lib/phone.ts`.
- **Texto copiado de Google Maps:** se le quitan el giro, "Abierto · Cierra a las…" y el teléfono pegado al final. Ejemplo:
  - Antes: "Ferretería · Calle Ignacio Zaragoza Nte. 10Abierto · Cierra a las 6 p.m. · 248…"
  - Después: "Calle Ignacio Zaragoza Nte. 10"
- **Colonia:** se toma del formato "CALLE, NÚMERO, COLONIA, CP". Si no viene, de la respuesta de OpenStreetMap.
- **Por depurar:** el contacto que no pasa el filtro va a esta vista. **No se borra**: se corrige ahí y vuelve a la cola.

Hoy, en IPESA, 209 de 575 contactos tienen dirección. Vienen en dos formatos: el ordenado con comas y el copiado de Google Maps.

## Cola "Para llamar hoy"
- **Quién ve qué:** el vendedor ve solo los contactos donde él es el responsable. El dueño ve la suya y la de cualquier vendedor.
- **Orden:**
  1. vencidos;
  2. los de hoy;
  3. nuevos nunca llamados, del más cercano al más lejano.

  Los que tienen "Ubicación no encontrada" van al final, pero se pueden llamar.
- **Columnas:** Negocio, Colonia, Distancia (≈ km), Contacto, Teléfono, Dirección y Correo, más la última nota.
- **Registrar llamada:**
  1. tocar el teléfono y llamar;
  2. elegir el resultado;
  3. escribir la nota;
  4. confirmar la fecha sugerida;
  5. guardar: pasa solo al siguiente contacto.
- Solo el responsable registra llamadas de su contacto.

## Reparto (solo dueño o administrador; Galón y Cubeta)
- **"Sin asignar":** solo la ve el dueño.
- **Asignación en bloque:** filtrando por colonia, segmento o distancia.
- **En partes iguales:** el sistema turna los contactos entre los vendedores.
- **Contacto creado por un vendedor:** queda como suyo. En Litro todo es del dueño.
- **Vendedor desactivado o quitado del equipo:** sus contactos vuelven a "Sin asignar" con todo su historial. Va en la misma función de la base que hoy cambia el estado del miembro (`app/api/store/members/route.ts`).

## Geolocalización (OpenStreetMap Nominatim, sin costo)
- **Cliente:** `lib/geocode.ts`.
  - Cabecera User-Agent que identifica a Matices.
  - Solo resultados de México, con sesgo hacia la ciudad de la tienda.
  - Una petición por segundo, como pide el servicio.
  - El resultado se guarda y no se repite.
- **Contacto nuevo o editado:** se geolocaliza al terminar la petición, con `after()` de Next.
- **Pendientes e importaciones:** los procesa `/api/cron/geocode`.
  - pg_cron lo llama cada 5 minutos, igual que `app/api/cron/reminders`.
  - Unos 40 contactos por corrida.
  - Falla cerrado sin su secreto.
- **Al corregir una dirección** se vuelve a geolocalizar.
- **La tienda** se geolocaliza al guardar su dirección. Sin ella no hay distancia.
- **Riesgo:** el servicio gratuito no admite cargas masivas.
  - Tope diario por tienda.
  - Si una tienda importa miles de contactos, tarda horas.
  - Plan B: distancia aproximada por código postal.

## Control diario y tablero (Galón y Cubeta)
- **Avance contra la meta, por persona y por día:** llamadas, contactos efectivos, cotizaciones, seguimientos y ventas.
- **Montos:** cotizado y vendido, del día y del mes.
- **Desglose por segmento y por resultado.**
- **Quién ve qué:** el dueño ve al equipo y elige a la persona; el vendedor ve solo lo suyo.

## Planes
- **Litro:**
  - Tiene: la cola, el registro de llamada y la próxima fecha.
  - Tope: 50 contactos.
  - El tope de "10 cotizaciones" desaparece. Se cambia en `plan_quota()` de la base y en `PLANS` de `lib/stores.ts`.
- **Galón y Cubeta:** todo, incluido el reparto, el control diario, las metas, el tablero y la distancia.
- **Textos que se actualizan:** `lib/planFeatures.ts` (`PLAN_COPY` y `PLAN_COMPARE`), Configuración → Plan y la portada.

## Etapas
Cada una: rama → pruebas → visto bueno → `main` → borrar la rama.

### Etapa 1. Mockup
- Pantallas: la cola, el registro de llamada, el reparto y el control diario, siguiendo el estilo actual.
- Solo HTML, sin tocar la app.

### Etapa 2. Datos
- **Migración:** columnas, tabla y metas. Simulacro en un bloque `DO` deshecho antes de pedir el sí.
- **Código:** `lib/commercial.ts` y `lib/address.ts`, con sus pruebas.

### Etapa 3. Depuración y geolocalización
- **Código:** `lib/geocode.ts` y `/api/cron/geocode`.
- **Migración:** pg_cron que llama a `/api/cron/geocode` (con visto bueno).
- **Vista "Por depurar".**
- **Primera pasada sobre IPESA:** 575 contactos, 209 con dirección.

### Etapa 4. Cola del vendedor y registro de llamada
- **APIs:** `app/api/data/commercial/*`, con `requireStore` y `fetchPaged` (`lib/paged.ts`).
- **Página:** `app/(app)/comercial/page.tsx`.

### Etapa 5. Reparto
- Asignación en bloque y en partes iguales.
- Regreso a "Sin asignar" al quitar a un vendedor.

### Etapa 6. Control diario, metas y tablero

### Etapa 7. Pasar Leads y quitarlos
- **Migración de datos** (con visto bueno): los 14 leads de IPESA.
  - El estado del lead pasa a `commercial_status` del contacto.
  - Sus actividades y notas pasan a `commercial_activities`.
  - El monto pasa a monto cotizado.
  - Se liga por `contact_id`, o por teléfono.
- **Pantallas que se ajustan:**
  - Inicio;
  - buscador;
  - Bandeja de WhatsApp: muestra el estado comercial del contacto;
  - Agenda: suma las próximas fechas;
  - "+ Nuevo";
  - menú;
  - bienvenida;
  - exportación: hoja de actividades comerciales.
- **Se retiran** la página y la API de Leads (las tablas quedan).
- **Versión 4.0.0.**

## Cómo se verifica
- **Pruebas de lógica:**
  - reglas de resultado → fecha y estado;
  - dirección válida y limpieza del texto de Google Maps;
  - colonia;
  - distancia;
  - orden de la cola;
  - visibilidad: un vendedor no ve ni registra contactos ajenos;
  - límites por plan.
- **Rutas con la base simulada:** sesión, tienda y rol. Litro recibe 403 en reparto y control diario.
- **Geolocalización:** pruebas con respuestas simuladas. Nunca se llama al servicio en masa desde local.
- **Migraciones:** simulacro deshecho, comparando conteos antes y después.
- **Antes de cada commit:** `tsc`, `npm run build` y las pruebas.
- **En local:** solo lectura sobre la base de producción, con escrituras simuladas.
- **En producción:** las rutas nuevas responden 401 sin sesión, y el dueño prueba la cola con su cuenta en IPESA.
