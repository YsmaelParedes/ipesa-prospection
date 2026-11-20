# Estadísticas (Umami) y SEO del sitio público

## Umami: qué es y cómo está conectado

[Umami](https://umami.is) es una herramienta de estadísticas web de código abierto. **No usa cookies** ni identifica a nadie, así que no hace falta un banner de consentimiento. Matices usa **Umami Cloud** (plan Hobby gratis: 100 mil eventos al mes, 1 sitio y 6 meses de historial).

| Pieza | Archivo | Qué hace |
|---|---|---|
| Configuración y eventos | `lib/analytics.ts` | ID del sitio, nombres de eventos, `track()` y `trackAttrs()` |
| Script y filtro | `components/Analytics.tsx` | Carga Umami en todas las páginas y decide qué se envía (`beforeSend`) |
| Script propio | `next.config.ts` → rewrite `/m.js` | Sirve el script de Umami desde matices.app |
| Puente de envíos | `app/api/send/route.ts` | Reenvía a Umami con la IP y el navegador del visitante; solo acepta matices.app |
| Límite | `proxy.ts` (`LIMIT_STATS`) | 120 envíos por minuto por IP, aparte del límite del CRM |

El script y los envíos pasan por matices.app. Así los bloqueadores de anuncios no los cortan y la CSP sigue siendo `'self'`.

### Configuración

El ID del sitio (`84f8fcbb-…`) está en `lib/analytics.ts`. No es secreto: va en el HTML de todas las páginas.

**Para cambiarlo**, pon otro ID en `NEXT_PUBLIC_UMAMI_WEBSITE_ID` (Vercel, Production) y vuelve a publicar. La variable `NEXT_PUBLIC_*` se fija al compilar.

**Para apagarlo**, pon `NEXT_PUBLIC_UMAMI_WEBSITE_ID=off` y vuelve a publicar. Así no se carga nada y `/api/send` responde 404.

**Solo envía desde www.matices.app**, nunca desde localhost ni desde las vistas previas de Vercel (`data-domains`).

**Para comprobar que funciona**, entra a www.matices.app sin sesión y revisa **Realtime** en Umami. La visita debe aparecer con país **México**.

**Variables opcionales**, solo para un Umami propio:
- `UMAMI_SCRIPT_URL`: por omisión `https://cloud.umami.is/script.js`.
- `UMAMI_COLLECT_URL`: por omisión `https://gateway.umami.is/api/send`.

### Qué se mide

**Visitas: solo las páginas públicas.** Cuentan la portada «/» sin sesión, `/inicio/*`, `/registro`, `/privacidad` y `/terminos`.
- Las pantallas del CRM nunca se registran como visita.
- «/» con sesión es el Inicio del CRM. Se distingue por `data-public-site` en `app/inicio/layout.tsx`.

**Datos de cada visita.**
- Solo se guardan los parámetros `utm_*`. Cualquier otro parámetro y el `#` se quitan.
- La referencia interna va sin parámetros.

**Velocidad real.** Con `data-performance`, Umami registra LCP, INP y CLS de cada página pública. Se consulta en el reporte *Performance*.

**Eventos del embudo**, en cualquier página:

| Evento | Cuándo | Datos |
|---|---|---|
| `Crear cuenta` | Clic en «Crear cuenta gratis» | `donde`: hero, menu, banda-final, whatsapp, plan-litro, plan-cubeta |
| `Demo usada` | Primera vez que alguien toca una demo | `demo`: registrar-llamada, contactos, equipo |
| `Cuenta creada` | El registro funcionó | — |
| `Pago iniciado` | Clic en pagar Cubeta (Configuración → Plan o el aviso de un candado) | `plan`, `periodo` (mensual, anual), `desde` (plan, aviso-equipo, aviso-whatsapp…) |
| `Candado visto` | Alguien en Litro ve una función de Cubeta (una vez por pantalla) | `funcion`: equipo, whatsapp, actividad, acumulado, contactos |
| `Candado clic` | Abre el aviso «Cambiar a Cubeta» desde un candado | `funcion` |
| `Plan contratado` | Vuelve de Stripe con el pago hecho (una vez) | `plan` |

**Embudo sugerido en Umami** (Reports → Funnel): visita a `/inicio/precios` → `Crear cuenta` → visita a `/registro` → `Cuenta creada`.

**Para registrar un clic nuevo**, agrega los atributos al enlace:

```tsx
<Link href="/registro" {...trackAttrs(EVENTS.signupClick, { donde: 'nuevo-lugar' })}>
```

No uses `data-umami-event`: Umami frena el enlace hasta enviar el evento y luego recarga la página completa.

### No contar tus propias visitas

En cada navegador donde uses www.matices.app, abre la consola (F12) y ejecuta:

```js
localStorage.setItem('umami.disabled', '1')
```

El navegador con «No rastrear» activado tampoco cuenta.

### Enlaces con UTM

Para saber qué canal trae registros, agrega UTM a los enlaces que compartas:

| Canal | Ejemplo |
|---|---|
| WhatsApp | `https://www.matices.app/?utm_source=whatsapp&utm_medium=mensaje&utm_campaign=lanzamiento` |
| Facebook / Instagram | `?utm_source=facebook&utm_medium=social&utm_campaign=<campaña>` |
| Correo | `?utm_source=correo&utm_medium=email&utm_campaign=<campaña>` |
| Visita a una tienda | `?utm_source=visita&utm_medium=qr&utm_campaign=<zona>` |

Usa siempre minúsculas y los mismos nombres. Umami los agrupa en el reporte *UTM*.

## SEO: plan por fases

### Hecho

**Base técnica, desde v2 del sitio.**
- Título, descripción y dirección canónica en las 15 páginas.
- Un solo H1 por página.
- Sitemap y robots.
- Imagen `/og`.
- Datos estructurados: Organization, WebSite, VideoObject, BreadcrumbList y FAQPage.

**Esta etapa.**
- **Precios en el HTML.** Portada, Precios y Cómo empezar se generan con los precios de Stripe y se renuevan cada hora (ISR). Antes Google veía «…».
- **Ficha del producto.** El SoftwareApplication anuncia los 3 planes con su precio mensual en MXN, impuestos incluidos. Va en la portada y en Precios.
- **Organization.** Lleva correo y punto de contacto de soporte (México, español).
- **Página de Precios.**
  - La descripción mide 159 caracteres (antes 174; Google corta a ~160).
  - Incluye FAQPage con sus 4 preguntas.
- **IndexNow.** El archivo de llave está en `public/` y `npm run seo:indexnow` avisa a Bing de los cambios. Córrelo después de publicar cambios en el sitio público.
- **Umami.** Mide de dónde llegan las visitas, qué páginas convierten y la velocidad real.

### Siguiente: contenido (la palanca más grande)

Las búsquedas de cola larga las ganan páginas útiles, no la portada.

**Sección «Guías» en `/inicio/guias`.** Empieza con 3 o 4 artículos para dueños de tiendas, por ejemplo:
- «Cómo dar seguimiento a cotizaciones en una tienda de pintura»
- «Excel vs CRM para controlar clientes de tu tienda»
- «Metas diarias para vendedores de mostrador»
- «Cómo organizar tu cartera de clientes por zonas»

**Comparativas.** Por ejemplo «Matices vs Excel» y «Matices vs libreta».

**Antes de escribir:** revisa en Search Console → Rendimiento qué consultas ya traen impresiones y elige temas cercanos.

### Siguiente: medición

- **Search Console.**
  - Confirmar que `sitemap.xml` esté enviado y sin errores.
  - Revisar cada mes: consultas, páginas con impresiones y poca tasa de clics (ajustar título y descripción), y errores de indexación.
- **Bing Webmaster Tools.** Importar el sitio desde Search Console, en un clic.
- **Umami.** Revisar cada mes el embudo, las fuentes con UTM y la velocidad (LCP < 2.5 s, INP < 200 ms, CLS < 0.1).

### Siguiente: autoridad

- **Perfiles de la marca.** Facebook, Instagram, LinkedIn y Google Business Profile si aplica. Agregarlos a `sameAs` en `organizationJsonLd` (`lib/site.ts`).
- **Directorios de software para negocios en México** y menciones de distribuidores o tiendas clientes que enlacen al sitio.
