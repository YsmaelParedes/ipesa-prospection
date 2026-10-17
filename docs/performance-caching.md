# Caché y medición de rendimiento

## Estado de la verificación

Se implementó la caché del cliente y la instrumentación. Se utilizó la sesión autenticada facilitada para medir compilaciones locales de producción. **Las mediciones adicionales se detuvieron por petición del usuario**, después de 20 recorridos optimizados por sección y 12 recorridos completos de referencia. No se utilizaron respuestas 401 como mediciones de rendimiento comercial.

- Compilación de producción inicial: correcta.
- Compilación de producción después de los cambios: correcta, con comprobación de TypeScript.
- Pruebas automatizadas: 30 correctas con `npm run test:cache`.
- Prueba controlada del adaptador: 20 lectores simultáneos del mismo recurso generan una petición de datos y una consulta compartida de sesión. Otra lectura vigente no genera una petición de datos adicional. Esta comprobación usa respuestas simuladas y no demuestra un porcentaje de mejora en producción.
- Prueba HTTP local de producción: contactos, dashboard, tarjeta independiente de WhatsApp, fórmulas y tiendas rechazan solicitudes sin sesión con 401 y entregan `private, no-store` y `Server-Timing`.
- No se modificó Supabase, no se enviaron mensajes y no se publicó ni se hizo push.

## Resultados observados

Cuenta de prueba con una sola tienda, sin contactos ni leads y sin WhatsApp conectado. Navegador de escritorio a 1440 × 900, sin limitar red. Referencia: commit `0a3a3f2`; versión optimizada: cambios de esta entrega. Ambas versiones se compilaron con Next 16.3.8 y consultaron los mismos datos. No se cambiaron diseño ni datos comerciales.

Comparación de los primeros 12 recorridos completos por sección, en milisegundos. Son recorridos consecutivos: incluyen el primer acceso a recursos todavía no cargados y regresos con caché vigente o vencida. No son 12 primeras visitas independientes.

| Sección | Mediana antes / después | p95 antes / después | Peticiones API antes / después | Bytes transferidos antes / después |
| --- | ---: | ---: | ---: | ---: |
| Dashboard | 719 / 17.3 | 1131 / 29.8 | 25 / 5 | 13464 / 2568 |
| Contactos | 382.9 / 16.2 | 3500.9 / 19.7 | 14 / 2 | 4408 / 630 |
| Leads | 507 / 16.6 | 1767 / 1634.4 | 13 / 6 | 4056 / 1875 |
| Agenda | 630.8 / 16.2 | 981.6 / 28.4 | 24 / 4 | 7536 / 1999 |

En los 20 recorridos de la versión optimizada, las medianas fueron 17.8, 16.2, 17.1 y 16.2 ms respectivamente; p95: 28.7, 19.7, 23.6 y 27.1 ms. El primer acceso a leads necesitó 1634.4 ms: la caché mejora los regresos, pero la primera descarga sigue dependiendo del backend. No se detectó desbordamiento horizontal en estos recorridos de escritorio.

Se midió desde el clic programático sobre el `Link` hasta el primer frame con contenido utilizable, observado cada 10 ms. Las peticiones y bytes vienen de Resource Timing e incluyen sondeos y tarjetas que terminaron en la ventana de cada paso. Se dejaron al menos 1.5 segundos entre pantallas para moderar el tráfico. No se activó deliberadamente el prefetch por hover. El tamaño reducido de los datos y las variaciones de red limitan la generalización de estos resultados.

Los registros sin datos comerciales están en `performance-before-desktop.json` y `performance-after-desktop.json`. La referencia quedó detenida con 50 pasos; la tabla usa los primeros 48, comunes a las dos versiones. Las comprobaciones automatizadas cubren carreras, cambio de contexto, caducidad, invalidaciones entre pestañas y respuestas 401/403/429/500.

No se completaron las series de 20 primeras visitas, la comparación móvil con red limitada, las escrituras de prueba ni las pruebas reales de cambio de tienda, revocación y cierre entre pestañas. Esta cuenta no tiene administración de plataforma ni una segunda tienda. No se afirma haber verificado esos escenarios en navegador. La revisión de escritorio también confirmó la carga del catálogo de fórmulas y corrigió el aviso de fallo que aparecía en el dashboard de una tienda sin WhatsApp conectado.

`scripts/benchmark-navigation.js` reproduce los recorridos de lectura. El helper opcional `benchmark-preview-proxy.mjs` solo escucha en loopback y retira CSP exclusivamente del proxy local para permitir que el evaluador del navegador lea tiempos de una compilación de producción; **no se despliega ni modifica la CSP de la aplicación**. Los dos builds se midieron con ese mismo helper. Su modo móvil, preparado pero no ejecutado, limita la bajada a 1.6 Mbps y añade 150 ms; no simula subida ni CPU. Los servidores auxiliares se detuvieron al concluir.

## Contrato de caché

`lib/queryPolicy.ts` centraliza vigencias y dependencias. Las claves incluyen usuario, tienda, rol, módulos, acceso, ámbito CRM/plataforma y URL normalizada. Solo se conserva información en memoria de la pestaña.

| Recurso | Vigencia | Máxima antigüedad reutilizable |
| --- | --- | --- |
| Contactos, leads, dashboard y recordatorios | 30 s | 10 min |
| Catálogos, fórmulas, plantillas y respuestas rápidas | 5 min | 10 min |
| Tiendas de plataforma | 15 s | 10 min |
| Pagos, cuotas y estadísticas/historial de campañas | 15 s | 1 min |
| Estado del número de WhatsApp | 60 s | 10 min |

Los datos vencidos se muestran mientras se revalidan, dentro de su límite máximo. Los errores no se almacenan como listas vacías exitosas. Los pagos y cuotas dejan de estar disponibles al superar un minuto sin una lectura válida. El contenedor informa fallos de actualización y oculta contenido vencido cuando no puede actualizarse.

Una escritura exitosa invalida sus dependencias. Las importaciones agrupan esa invalidación, incluso ante éxito parcial. Las respuestas anteriores a una invalidación o cambio de contexto se descartan. Se eliminan entradas después de diez minutos sin consumidores y se conservan como máximo 100 entradas inactivas.

Los avisos entre pestañas incluyen eventos, ámbitos e identificadores de recursos; no incluyen filas comerciales. Los cambios de sesión actualizan su lectura visual; cerrar sesión o cambiar tienda recarga las demás pestañas. El shell, buscador, notificaciones, modales y páginas se remontan cuando cambia el ámbito de autorización.

La autorización del backend sigue consultando usuario y membresía vigentes en cada petición. La caché visual nunca decide si una escritura está permitida. Las respuestas autenticadas no usan caché HTTP ni service worker para almacenar datos privados.

## React y navegación

- `useCachedQuery<T>` devuelve datos, error, carga inicial, actualización y recarga explícita. Se usa para pagos, tiendas, cuotas y la tarjeta independiente del dashboard.
- `useQueryEffect` adapta los cargadores existentes: registra las lecturas sincrónicas iniciadas por el efecto y las vuelve a ejecutar cuando sus entradas cambian. Debe contener únicamente carga de datos; los reinicios de formularios van en un `useEffect` separado.
- Las lecturas iniciadas después de un temporizador o un `await` requieren una suscripción explícita con `useQueryRefresh` cuando no tienen otra dependencia registrada que las actualice.
- Las páginas principales inicializan su estado desde memoria para evitar un indicador de carga al regresar.
- `CachedLink` precarga lecturas permitidas al enfocar o mantener el puntero 120 ms; limita a dos solicitudes simultáneas y respeta ahorro de datos.

WhatsApp conserva intervalos de 6 s para el hilo, 15 s para la bandeja y 30 s para el contador. Recordatorios usa un sondeo compartido de 60 s. Los sondeos se detienen con la pestaña oculta y se reanudan al volver. Los fallos usan espera progresiva y respetan `Retry-After`.

Los GET que marcan mensajes como leídos solo comparten una petición en curso: no reutilizan respuestas ni se precargan. Las vistas previas mantienen claves independientes.

## Compatibilidad del dashboard

`GET /api/data/dashboard` conserva su comportamiento anterior para otros consumidores. La aplicación solicita `?includeWhatsApp=0` para mostrar las métricas principales sin esperar la consulta externa de Meta.

`GET /api/data/dashboard/whatsapp` exige administrador de tienda y módulo WhatsApp; devuelve `{ people24h, dailyLimit }`. La tarjeta muestra un guion mientras no haya una lectura válida, sin presentar cero como resultado de un fallo.

## Instrumentación y reproducción

Las lecturas instrumentadas devuelven `Server-Timing` con `auth`, `store`, `database`, `external` y `total`, según las operaciones realizadas. Son duraciones del servidor. Las categorías pueden solaparse y sumar más que `total` porque hay consultas paralelas; los fetch de base de datos/Meta miden hasta recibir cabeceras. No contienen SQL, parámetros, identificadores de usuarios ni credenciales.

En el navegador, `performance.getEntriesByName('crm:api')` contiene hasta 200 medidas locales de llamadas del cliente, incluyendo esperas de sesión y acceso a memoria. No equivalen al número de solicitudes de red; para eso se usa Resource Timing/Network. No se envía telemetría a terceros.

`performance.getEntriesByName('crm:view-ready')` registra la primera carga utilizable de dashboard, contactos, leads y recordatorios desde el montaje hasta el siguiente frame. No incluye el tiempo previo al montaje ni sustituye una medición del clic a la pantalla final. Las demás secciones requieren la grabación de navegación del navegador.

Para medir la API con una sesión de prueba, configurar `CRM_BENCH_URL` y `CRM_BENCH_COOKIE` en el entorno del proceso y ejecutar `npm run benchmark:api`. `CRM_BENCH_ADMIN=1` incluye tiendas y pagos si la cuenta tiene acceso. El script toma 20 muestras por recurso, informa mediana/p95, tiempo hasta cabeceras, tiempo total, bytes decodificados y `Server-Timing`. Espacia lecturas y se detiene ante errores; nunca imprime cookies ni cuerpos comerciales. No modifica datos, marca chats como leídos ni simula una red móvil.

Para completar la comparación de navegación:

1. Usar la misma compilación de producción, cuenta, tienda y datos en cada versión comparada.
2. Medir escritorio sin limitación y móvil a 390 × 844, con 150 ms de latencia, 1.6 Mbps de bajada y 750 Kbps de subida, sin cambiar ese perfil entre versiones.
3. Hacer 20 recorridos por sección: primera visita, regreso antes/después de caducar, regreso desde pestaña oculta y cambio confirmado con datos de prueba.
4. Registrar tiempo del clic a datos visibles, peticiones efectivas y bytes transferidos. Mantener habilitada la caché normal del navegador para comparar navegación real.
5. Verificar cambios de tienda, rol, cierre de sesión entre pestañas, red interrumpida, respuestas 429/500 y formularios abiertos durante una revalidación.
6. Comparar mediana y p95, anotando que 20 muestras son orientativas. No mezclar tiempos de desarrollo, respuestas sin sesión ni resultados simulados con producción.

La primera carga todavía descarga listados completos de contactos y leads. La paginación y búsqueda en servidor quedan fuera de esta entrega, igual que Redis y cambios de base de datos.
