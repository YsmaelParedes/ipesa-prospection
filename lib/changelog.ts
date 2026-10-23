/**
 * Notas de versión ("Novedades"). No se abren solas: se consultan con el
 * botón de la versión, abajo en el menú. La entrada más reciente va primero y
 * su número es la versión de la app (CURRENT_VERSION).
 *
 * Las leen TODAS las tiendas y todo su equipo. Solo va lo que el usuario
 * puede ver y usar, en sus palabras. Nunca: detalles de seguridad o de cómo
 * se protege algo, proveedores e infraestructura, base de datos, migraciones,
 * cifras o datos de una tienda en particular, ni nada del panel del dueño de
 * la plataforma.
 *
 * Lo que solo existe en algunas tiendas lleva `module` (en la entrada o en el
 * renglón): WhatsApp, Campañas o Fórmulas. changelogFor() lo oculta a las
 * tiendas que no lo tienen.
 *
 * Versionado semántico MAYOR.MENOR.CORRECCIÓN:
 *  · MAYOR: un cambio grande en cómo se usa la app (p. ej. 2.0.0, multi-tienda).
 *  · MENOR: funciones nuevas o cambios visibles.
 *  · CORRECCIÓN: arreglos y ajustes pequeños.
 * Mantener package.json con el mismo número.
 */
import type { StoreModule } from './stores'

type Item = string | { text: string; module: StoreModule }

export type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: Item[]
  /** La entrada completa solo aplica a tiendas con este módulo. */
  module?: StoreModule
}

export type VisibleEntry = { version: string; date: string; title: string; items: string[] }

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.5.0',
    date: '23 de octubre, 2026',
    title: 'Sistema comercial nuevo',
    items: [
      'El sistema comercial ahora tiene 3 pantallas: Hoy (a quién llamar o visitar), Oportunidades (tus cotizaciones abiertas) y Equipo (las metas de cada vendedor).',
      'Registra cada llamada en 3 pasos: tipo, resultado y cuándo volver a contactar (la fecha ya viene sugerida).',
      'Cada cliente avanza en un solo camino: Prospecto, Contactado, Cotización y Cliente.',
      'Todo el equipo ve los prospectos sin dueño; quien registra la primera llamada se queda con él.',
      'En celular, botones grandes para llamar o escribir por WhatsApp; en la computadora, la lista y la ficha lado a lado.',
      'Metas diarias por vendedor, con su cumplimiento del día y del mes.',
      'Nuevas zonas para filtrar tus contactos (se agregan en Configuración → Catálogos).',
      'Ya puedes guardar negocios sin teléfono para visitarlos en persona: aparecen en Hoy como «Para visita».',
    ],
  },
  {
    version: '4.4.0',
    date: '22 de octubre, 2026',
    title: 'Cambio en los avisos de la Agenda',
    items: [
      'Por ahora los recordatorios ya no te avisan uno por uno a su hora. Revisa la Agenda durante el día.',
      'Sigue llegando a las 8:00 el aviso con tu agenda del día y los pendientes vencidos.',
    ],
  },
  {
    version: '4.3.0',
    date: '22 de octubre, 2026',
    title: 'Configura tu agente de IA',
    module: 'whatsapp',
    items: [
      'Nueva pestaña «Agente IA» en WhatsApp para el dueño y los administradores.',
      'Enciende o apaga la IA y elige si contesta solo a números de prueba o a todos tus clientes.',
      'Elige qué dice al pasar el chat al equipo y si manda un recordatorio cuando el cliente deja de contestar.',
      'Agrega o quita los números de prueba.',
    ],
  },
  {
    version: '4.2.0',
    date: '22 de octubre, 2026',
    title: 'Trabaja junto con el agente de IA',
    module: 'whatsapp',
    items: [
      'Te avisamos al celular cuando el agente de IA pide que alguien del equipo conteste un chat.',
      'Cuando contestas tú, el agente se calla en ese chat. Con el botón «Devolver al agente» vuelve a atenderlo.',
    ],
  },
  {
    version: '4.1.0',
    date: '22 de octubre, 2026',
    title: 'El agente de IA en la bandeja',
    module: 'whatsapp',
    items: [
      'Si tu número de WhatsApp tiene un agente de IA, los mensajes que atiende y sus respuestas aparecen en la bandeja.',
      'Las respuestas del agente llevan la marca «Agente IA».',
    ],
  },
  {
    version: '4.0.2',
    date: '22 de octubre, 2026',
    title: 'WhatsApp se desplaza de nuevo',
    module: 'whatsapp',
    items: ['Ya puedes bajar en la lista de conversaciones, el chat, la ficha del contacto y los resultados de WhatsApp.'],
  },
  {
    version: '4.0.1',
    date: '21 de octubre, 2026',
    title: 'Tiendas gratis sin uso',
    items: [
      'Si una tienda del plan Litro pasa 6 meses sin que nadie la use, su dueño recibe un correo 30 y 7 días antes de que se elimine. Para conservarla basta con entrar. Los planes de paga no se eliminan. Detalles en los Términos de uso.',
    ],
  },
  {
    version: '4.0.0',
    date: '20 de octubre, 2026',
    title: 'Sistema comercial (reemplaza a Leads)',
    items: [
      'Nueva sección Comercial con las pestañas de tu hoja de seguimiento: Resumen, Hoy, Seguimiento, Actividades, Base comercial, Alta de prospectos y Control diario.',
      'Hoy: tu meta del día arriba y abajo tu cola para llamar (vencidos, los de hoy y los nuevos con dirección completa). Marca "No contesta" con un toque o elige otro resultado y la app te sugiere cuándo volver a llamar.',
      'Seguimiento: tablero por etapa (contactado, interés, cotización, cliente) con potencial mensual, probabilidad y días sin contacto.',
      'Actividades: la bitácora de llamadas, WhatsApp, visitas y notas, con filtros por día, tipo, resultado y vendedor.',
      'Base comercial: todos tus contactos con su colonia, dirección, próximo seguimiento y última nota; filtra "Por depurar" (sin número de calle o teléfono equivocado), programados, clientes y prioridad.',
      'Alta de prospectos: captura con prioridad, potencial mensual, origen y observaciones; avisa si el teléfono ya existe y puedes llamar en ese momento.',
      'Galón y Cubeta: el dueño reparte contactos entre sus vendedores, ve el Resumen del mes y el Control diario contra la meta, con las observaciones del día de cada persona.',
      'Leads se retiró: cada lead quedó como historial de su contacto, con su estado, montos y notas.',
    ],
  },
  {
    version: '3.2.1',
    date: '20 de octubre, 2026',
    title: 'Planes más fáciles de distinguir',
    items: [
      'Cada plan tiene su ícono (litro, galón y cubeta) y su nombre en grande, en la página de Precios y en Configuración → Plan.',
    ],
  },
  {
    version: '3.2.0',
    date: '20 de octubre, 2026',
    title: 'Botón de Ayuda',
    items: [
      'Nuevo botón "Ayuda" en el menú, debajo de Configuración: abre un correo a soporte@matices.app con los datos de tu tienda ya escritos para atenderte más rápido.',
    ],
  },
  {
    version: '3.1.2',
    date: '20 de octubre, 2026',
    title: 'Correos de contacto',
    items: [
      'Ahora hay un correo para cada tema: hola@matices.app (dudas), soporte@matices.app (ayuda con tu tienda), facturacion@matices.app (cobros y facturas) y privacidad@matices.app (tus datos).',
    ],
  },
  {
    version: '3.0.0',
    date: '18 de octubre, 2026',
    title: 'Planes Litro, Galón y Cubeta',
    items: [
      'Ahora hay tres planes: Litro (gratis), Galón (equipo de hasta 3 y sin límites) y Cubeta (todo, con WhatsApp y hasta 5 usuarios).',
      'Puedes cambiar de plan, pagar con tarjeta, descargar tus facturas o cancelar desde Configuración → Plan.',
      'Si bajas de plan o dejas de pagar no se borra nada: tu tienda pasa al plan Litro y sigues viendo toda tu información.',
      'Cualquier tienda puede crear su cuenta gratis desde el sitio, sin esperar una invitación.',
      'Matices ahora vive en www.matices.app. Entra desde ahí, vuelve a activar los avisos en cada celular y, si la tenías instalada, agrega la app otra vez desde la nueva dirección.',
    ],
  },
  {
    version: '2.13.0',
    date: '17 de octubre, 2026',
    title: 'Nuevo sitio de Matices',
    items: [
      'La página de presentación ahora es un sitio con varias secciones: Inicio, Funciones, WhatsApp, Cómo empezar y Preguntas.',
    ],
  },
  {
    version: '2.12.0',
    date: '17 de octubre, 2026',
    title: 'Exportar e importar, solo para el dueño',
    items: [
      'Exportar a Excel, importar listas y borrar contactos ahora son solo para el dueño y los administradores.',
    ],
  },
  {
    version: '2.11.0',
    date: '17 de octubre, 2026',
    title: 'Listas y casillas con el diseño de Matices',
    items: [
      'Las listas para elegir (segmento, canal, estado, rol, plantilla…) ahora se abren como una tarjeta con el diseño de la app: la opción elegida lleva palomita, los segmentos muestran su color y las listas largas tienen buscador.',
      'Se pueden usar con el teclado: flechas para moverte, Enter para elegir, Escape para cerrar y escribir para saltar a una opción.',
      'Las casillas para marcar también tienen el diseño de la app.',
    ],
  },
  {
    version: '2.10.0',
    date: '16 de octubre, 2026',
    title: 'Pantalla clara cuando algo falla',
    items: [
      'Si algo falla dentro de la app, ahora ves un mensaje claro con el botón "Reintentar" en lugar de una pantalla en blanco.',
    ],
  },
  {
    version: '2.9.0',
    date: '16 de octubre, 2026',
    title: 'Nuevo nombre y logo: Matices',
    items: [
      'La app ahora se llama Matices y estrena logo: franjas de pintura de colores en capas.',
      'El nuevo logo aparece en el menú, el ícono de la app instalada en tu celular, la pestaña del navegador y los avisos.',
      'Si tienes la app instalada en el celular, puede tardar un poco en cambiar el ícono; abrirla de nuevo con internet lo actualiza.',
    ],
  },
  {
    version: '2.8.0',
    date: '16 de octubre, 2026',
    title: 'WhatsApp para tu tienda',
    items: [
      'Si tu tienda aún no tiene WhatsApp, el dueño lo ve en el menú y en Configuración como "Por activar", con lo que puedes hacer con él.',
      'Con el botón "Quiero activarlo" envías tu solicitud y un asesor te contacta para dejarlo listo con el número de tu tienda, sin que hagas nada técnico.',
      { text: 'Configuración → WhatsApp ahora solo muestra tu número, su calidad y tu límite.', module: 'whatsapp' },
    ],
  },
  {
    version: '2.7.1',
    date: '16 de octubre, 2026',
    title: 'Avisos de Meta más claros',
    module: 'whatsapp',
    items: [
      'Los avisos de Meta sobre tu número ya no incluyen los de llamadas, que no afectan el envío de mensajes, y el aviso del nombre visible pendiente aparece en español.',
    ],
  },
  {
    version: '2.7.0',
    date: '16 de octubre, 2026',
    title: 'Campañas de WhatsApp con las reglas oficiales de Meta',
    module: 'campaigns',
    items: [
      'El límite de envíos ahora es el que Meta le asigna a tu número, y sube solo cuando Meta te da un nivel mayor.',
      'El límite cuenta personas distintas en 24 h, no mensajes. Quien te escribió en las últimas 24 h no cuenta.',
      'Las campañas se envían mucho más rápido, dentro de los límites de velocidad de Meta.',
      'Ya no se omite a quien recibió la misma plantilla en los últimos 7 días. Solo se omite 24 h a quien Meta pidió no reenviarle marketing por ahora.',
      'Si un cliente se da de baja del marketing desde WhatsApp, se marca solo y no recibe más campañas.',
      'Si Meta bloquea el número o pausa una plantilla, la campaña se detiene y te dice por qué. El selector de plantillas muestra la calidad de cada una.',
    ],
  },
  {
    version: '2.6.1',
    date: '15 de octubre, 2026',
    title: 'Ajustes en celular',
    items: [
      'En celular ya se puede hacer zoom, y las ventanas, el menú y los avisos se acomodan mejor a pantallas pequeñas.',
      'La selección de contactos vuelve a estar disponible en celular.',
      { text: 'Fórmulas ya no deja un panel vacío al abrirse.', module: 'formulas' },
      { text: 'El envío de prueba de una campaña respeta a quien se dio de baja y queda en el historial.', module: 'campaigns' },
    ],
  },
  {
    version: '2.6.0',
    date: '15 de octubre, 2026',
    title: 'Envía archivos por WhatsApp',
    module: 'whatsapp',
    items: [
      'En el chat de WhatsApp, el clip 📎 junto al cuadro de texto adjunta un archivo: fotos (JPG o PNG), PDF, Word, Excel, PowerPoint, texto o video MP4, de hasta 4 MB.',
      'Puedes escribir un comentario que se envía junto con el archivo. Las fotos se ven en el chat y los documentos se abren con un clic.',
      'Como los mensajes normales, solo se puede enviar mientras la conversación está abierta (24 h desde el último mensaje del cliente).',
    ],
  },
  {
    version: '2.5.1',
    date: '15 de octubre, 2026',
    title: 'Novedades a tu ritmo',
    items: [
      'Las novedades ya no se abren solas al entrar: las consultas cuando quieras con el botón de la versión, abajo en el menú.',
      'La app ahora usa números de versión (por ejemplo 2.5.1) en lugar de fechas.',
    ],
  },
  {
    version: '2.5.0',
    date: '15 de octubre, 2026',
    title: 'Descarga tu información y Configuración más simple',
    items: [
      'Nuevo botón "Exportar" en Leads: descarga a Excel los leads que estás viendo.',
      'En Configuración → Tienda, "Descarga tu información" baja en un solo Excel toda la información de tu tienda.',
      'Configuración ya no tiene la pestaña "Herramientas".',
    ],
  },
  {
    version: '2.4.0',
    date: '9 de octubre, 2026',
    title: 'Teléfonos mejor cuidados',
    items: [
      { text: 'Los números que no tienen WhatsApp ya no reciben campañas: en Campañas aparecen como "Sin WhatsApp" y no se pueden elegir. No se borran, porque pueden ser teléfonos fijos útiles para llamar.', module: 'campaigns' },
      { text: 'En la Bandeja los números sin WhatsApp llevan una marca roja, y el chat avisa antes de mandarles una plantilla, con un botón para llamar.', module: 'whatsapp' },
      { text: 'Resultados tiene una vista nueva, "Por persona": cómo le fue a cada número con tus campañas, con búsqueda, exportar a Excel (CSV) y copiar los números.', module: 'campaigns' },
      { text: 'Campañas tiene un filtro "Historial" para elegir, por ejemplo, solo a quienes nunca les has enviado una campaña o a quienes leyeron sin responder.', module: 'campaigns' },
      { text: 'Resultados muestra cada campaña por separado, con leídos, entregados, pendientes, no entregados y respuestas, y el motivo de cada mensaje que no llegó.', module: 'campaigns' },
      { text: 'Si Meta no entregó por un límite temporal, "Reintentar" abre Campañas con esa plantilla y esos contactos ya elegidos.', module: 'campaigns' },
      'Se quitó "Posibles fijos" de Contactos: adivinaba por el número y se equivocaba. Al importar ya no se descartan números por parecer fijos.',
    ],
  },
  {
    version: '2.3.0',
    date: '6 de octubre, 2026',
    title: 'Fórmulas de Vintek',
    module: 'formulas',
    items: [
      'Fórmulas ahora incluye el catálogo Vintek INFINITE 1000, con 1,232 colores y su muestra de color real, junto al de Vinipesa Matte.',
      'Cambia entre catálogos con las pestañas de arriba; la búsqueda por nombre o código y el cálculo en litro, galón, cubeta o cualquier cantidad funcionan igual en los dos.',
    ],
  },
  {
    version: '2.2.0',
    date: '2 de octubre, 2026',
    title: 'Avisos a tiempo',
    items: [
      'Importante: la app cambió de dirección. Vuelve a activar los avisos en cada celular y computadora con el botón "Activar" que aparece arriba, o en Configuración → Mi cuenta. En iPhone, borra el ícono viejo y agrega la app otra vez desde Safari.',
      'Los recordatorios ahora te avisan a la hora exacta, aunque la app esté cerrada (antes llegaban todos juntos a las 8:00).',
      'A las 8:00 te llega un solo aviso con tu agenda del día y los pendientes vencidos.',
      'Cada aviso dice qué hacer y con quién, por ejemplo "📞 Llamar a Juan Pérez", y al tocarlo se abre la pantalla correcta aunque la app ya esté abierta.',
      'Al activar los avisos te llega una prueba al instante, y si el navegador los tiene bloqueados te decimos cómo permitirlos.',
    ],
  },
  {
    version: '2.1.0',
    date: '2 de octubre, 2026',
    title: 'Todo más ordenado y a la mano',
    items: [
      'Nuevo Inicio: arriba ves lo que toca hoy y lo urgente aparece primero.',
      'Buscador en la barra superior: encuentra cualquier cliente por nombre, teléfono o empresa desde cualquier pantalla (atajo: tecla /). Si no existe, lo das de alta ahí mismo.',
      'Botón "+ Nuevo" para crear un contacto o un recordatorio sin cambiar de pantalla. En el celular, el botón rojo crea lo de la pantalla en la que estás.',
      'El menú sigue el orden del día, con el mismo nombre en computadora y celular. "Recordatorios" ahora se llama Agenda y muestra cuántos tienes para hoy.',
      'Contactos: un solo buscador, filtros por segmento y canal, y "Exportar" baja exactamente lo que estás viendo. Al importar, las columnas se reconocen solas.',
      'Agenda: pospón un recordatorio con un clic (1 hora, mañana, en 3 días o el lunes).',
      'Los avisos en el celular se activan ahora en Configuración → Mi cuenta. "Tipo de cliente" se llama Segmento en toda la app.',
    ],
  },
  {
    version: '2.0.0',
    date: '2 de octubre, 2026',
    title: 'Nueva imagen y tu tienda en la nube',
    items: [
      'Nueva imagen con un diseño en rojo y arcoíris de colores.',
      'Tu tienda ahora tiene su propio espacio: conserva todos sus clientes y su historial, separados de las demás tiendas, con su logo en el menú.',
      'Configuración renovada: datos y logo de la tienda, catálogos, equipo y plan, cada uno en su sección.',
      'Invita a tu equipo con un enlace personal que se comparte por WhatsApp; puedes cambiar roles o desactivar accesos cuando quieras.',
      'Nueva sección "Mi cuenta" para cambiar tu nombre y tu contraseña. Al cambiarla se cierra tu sesión en los demás dispositivos.',
      'Nuevas pantallas para entrar, crear cuenta y recuperar tu contraseña.',
    ],
  },
  {
    version: '1.3.0',
    date: '2 de octubre, 2026',
    title: 'WhatsApp dentro del CRM',
    module: 'whatsapp',
    items: [
      'Nueva bandeja de WhatsApp: lee y responde a tus clientes desde el CRM, con búsqueda, filtros (no leídas, sin contacto) y contador de mensajes sin leer en el menú.',
      'Fotos, audios, videos y documentos se ven directo en el chat, con palomitas de enviado, entregado y leído.',
      'Junto al chat está la ficha del cliente: guarda el número como contacto o programa un recordatorio de seguimiento sin salir de la conversación.',
      'Respuestas rápidas para el equipo (las crea un administrador en Configuración); {nombre} se cambia solo por el nombre del cliente.',
      'Aviso en tu celular cuando un cliente te escribe. Se puede apagar en la campana de notificaciones → "Avisarme cuando llegue un WhatsApp".',
      { text: 'Si un cliente escribe BAJA o STOP deja de recibir campañas automáticamente (también se puede marcar a mano en su ficha).', module: 'campaigns' },
      { text: 'Nueva pestaña "Resultados" en Campañas (administradores): entregados, leídos, respuestas y fallidos por plantilla.', module: 'campaigns' },
      'La sección de WhatsApp se ve bien en celular, tablet y computadora.',
    ],
  },
  {
    version: '1.2.0',
    date: '28 de septiembre, 2026',
    title: 'Panel de campañas en WhatsApp',
    module: 'campaigns',
    items: [
      'Nueva pestaña "Campañas" dentro de WhatsApp (solo administradores) para elegir contactos y mandar una plantilla aprobada.',
      'Selector de contactos con buscador, "Elegir todos" y filtro por segmento, más vista previa de la plantilla.',
      'Las plantillas se consultan en vivo desde Meta: ya no hay que agregarlas a mano cada vez que se aprueba una nueva.',
      'Ventana de confirmación antes de mandar y barra de progreso mientras se envía.',
    ],
  },
  {
    version: '1.1.0',
    date: '26 de septiembre, 2026',
    title: 'Nueva sección: Fórmulas',
    module: 'formulas',
    items: [
      'Nueva sección "Fórmulas" en el menú para igualar colores de Vinipesa Matte (INFINITE 2000).',
      'Busca cualquier color por nombre o código y elige el volumen a preparar: Litro, Galón, Cubeta o cualquier cantidad personalizada en litros o mL.',
      'Las cantidades de colorante se muestran ya convertidas a mL, listas para dosificar, junto a la muestra de color real.',
    ],
  },
  {
    version: '1.0.0',
    date: '6 de agosto, 2026',
    title: 'Roles de administrador y accesos rápidos',
    items: [
      'Nuevo rol de administrador: puede ver y supervisar el trabajo de todo el equipo, no solo el propio.',
      'En Configuración se puede asignar quién es administrador, con confirmación antes de aplicar el cambio.',
      'Los filtros de Contactos se rediseñaron: son más rápidos de usar y ya no fallan en el celular.',
      'Nuevo botón para volver arriba rápidamente cuando llevas mucho scroll en una lista larga.',
      'Botones de llamar, WhatsApp, editar y eliminar con mejor tamaño para tocar desde el celular.',
    ],
  },
]

export const CURRENT_VERSION = CHANGELOG[0].version

/** Las notas que le tocan a una tienda: sin lo de módulos que no tiene. */
export function changelogFor(modules: Partial<Record<StoreModule, boolean>> | null | undefined): VisibleEntry[] {
  const has = (m?: StoreModule) => !m || !!modules?.[m]
  return CHANGELOG
    .filter(e => has(e.module))
    .map(e => ({
      version: e.version, date: e.date, title: e.title,
      items: e.items.filter(it => typeof it === 'string' || has(it.module)).map(it => (typeof it === 'string' ? it : it.text)),
    }))
    .filter(e => e.items.length > 0)
}
