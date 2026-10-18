/**
 * Notas de versión ("Novedades"). No se abren solas: se consultan con el
 * botón de la versión, abajo en el menú. La entrada más reciente va primero y
 * su número es la versión de la app (CURRENT_VERSION).
 *
 * Versionado semántico MAYOR.MENOR.CORRECCIÓN:
 *  · MAYOR: un cambio grande en cómo se usa la app (p. ej. 2.0.0, multi-tienda).
 *  · MENOR: funciones nuevas o cambios visibles.
 *  · CORRECCIÓN: arreglos y ajustes pequeños.
 * Mantener package.json con el mismo número.
 */
export type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.13.0',
    date: '17 de octubre, 2026',
    title: 'Nuevo sitio de Matices',
    items: [
      'La página de presentación ahora es un sitio con varias secciones: Inicio, Funciones, WhatsApp, Cómo empezar y Preguntas.',
      'Incluye una demostración de Leads que cualquiera puede usar: mover cotizaciones de etapa y ver cómo cambia la venta.',
    ],
  },
  {
    version: '2.10.0',
    date: '16 de octubre, 2026',
    title: 'Pantalla clara cuando algo falla',
    items: [
      'Si algo falla dentro de la app, ahora ves un mensaje claro con el botón "Reintentar" en lugar de una pantalla en blanco.',
      'Al equipo de Matices le llega un aviso al momento para revisarlo, sin que tengas que reportarlo.',
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
      'Configuración → WhatsApp ahora solo muestra tu número, su calidad y tu límite: la conexión técnica la hace tu asesor.',
    ],
  },
  {
    version: '2.7.1',
    date: '16 de octubre, 2026',
    title: 'Avisos de Meta más claros',
    items: [
      'Los avisos de Meta sobre el número ya no incluyen los de llamadas, que no afectan el envío de mensajes, y el aviso del nombre visible pendiente aparece en español.',
    ],
  },
  {
    version: '2.7.0',
    date: '16 de octubre, 2026',
    title: 'Campañas de WhatsApp con las reglas oficiales de Meta',
    items: [
      'El límite de envíos ahora es el real de Meta para tu número (hoy 2,000 personas al día), y sube solo cuando Meta te asigna un nivel mayor.',
      'El límite cuenta personas distintas en 24 h, no mensajes. Quien te escribió en las últimas 24 h no cuenta.',
      'Las campañas se envían mucho más rápido: sin la pausa de 3 segundos entre mensajes, dentro de los límites de velocidad de Meta.',
      'Ya no se omite a quien recibió la misma plantilla en los últimos 7 días. Solo se omite 24 h a quien Meta pidió no reenviarle marketing por ahora.',
      'Si un cliente se da de baja del marketing desde WhatsApp, se marca solo y no recibe más campañas.',
      'Si Meta bloquea el número o pausa una plantilla, la campaña se detiene y te dice por qué. El selector de plantillas muestra la calidad de cada una.',
    ],
  },
  {
    version: '2.6.1',
    date: '15 de octubre, 2026',
    title: 'Revisión de seguridad y ajustes en celular',
    items: [
      'Aceptar una invitación ahora respeta el límite de usuarios de tu plan, aunque se haya reactivado a alguien mientras tanto.',
      'Los borradores de WhatsApp se separan por cuenta y tienda, y se borran al cerrar sesión.',
      'El envío de prueba de WhatsApp cuenta para el límite diario, respeta a quien se dio de baja y queda en el historial.',
      'En celular ya se puede hacer zoom, y las ventanas, el menú y los avisos se acomodan mejor a pantallas pequeñas.',
      'La selección de contactos vuelve a estar disponible en celular y Fórmulas ya no deja un panel vacío al abrirse.',
      'Los cambios de acceso se consultan al momento y los envíos simultáneos de WhatsApp respetan la cuota diaria.',
    ],
  },
  {
    version: '2.6.0',
    date: '15 de octubre, 2026',
    title: 'Envía archivos por WhatsApp',
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
      'En Configuración → Tienda, "Descarga tu información" baja en un solo Excel tus contactos, leads con su historial, agenda y catálogos.',
      'Configuración ya no tiene la pestaña "Herramientas": WhatsApp, Campañas y Fórmulas quedan siempre activos en tu tienda.',
    ],
  },
  {
    version: '2.4.0',
    date: '9 de octubre, 2026',
    title: 'Campañas con más control',
    items: [
      'Los números que no tienen WhatsApp (Meta rechazó el envío por eso) ya no reciben campañas: en Campañas aparecen como "Sin WhatsApp" y no se pueden elegir. No se borran, porque pueden ser teléfonos fijos útiles para llamar.',
      'En la Bandeja esos números llevan una marca roja, y el chat avisa antes de mandarles una plantilla, con un botón para llamar.',
      'Resultados tiene una vista nueva, "Por persona": cómo le fue a cada número con tus campañas (respondió, leyó, no le llegó, sin WhatsApp…), con búsqueda, exportar a Excel (CSV) y copiar los números.',
      'Campañas tiene un filtro "Historial" para elegir, por ejemplo, solo a quienes nunca les has enviado una campaña o a quienes leyeron sin responder.',
      'Al terminar un envío, "Ver en Resultados" te lleva a ver quién lo recibió (Meta confirma la entrega en los minutos siguientes).',
      'Resultados ahora muestra cada campaña por separado, con una barra de leídos, entregados, pendientes y no entregados, y cuántas personas respondieron.',
      'Al abrir una campaña ves a cada destinatario con su estado y, si el mensaje no llegó, el motivo en palabras sencillas (por ejemplo, el número no tiene WhatsApp o Meta alcanzó su límite de marketing por persona).',
      'Te avisa cuando un número ya había fallado antes por lo mismo, para que sepas cuáles conviene revisar.',
      'Puedes filtrar por estado, buscar por nombre o teléfono, exportar la lista a Excel (CSV) y copiar los números que no recibieron el mensaje.',
      'Si Meta no entregó por un límite temporal, "Reintentar" abre Campañas con esa plantilla y esos contactos ya elegidos; tú revisas y confirmas el envío.',
      'Se quitó "Posibles fijos" de Contactos: adivinaba por el número y se equivocaba. Al importar ya no se descartan números por parecer fijos.',
    ],
  },
  {
    version: '2.3.0',
    date: '6 de octubre, 2026',
    title: 'Fórmulas de Vintek',
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
      'Importante: la app cambió de dirección (crm-pinturas.vercel.app). Vuelve a activar los avisos en cada celular y computadora con el botón "Activar" que aparece arriba, o en Configuración → Mi cuenta. En iPhone, borra el ícono viejo y agrega la app otra vez desde Safari.',
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
      'Nuevo Inicio: arriba ves lo que toca hoy (recordatorios vencidos y del día, leads sin seguimiento y chats sin leer) y lo urgente aparece primero.',
      'Buscador en la barra superior: encuentra cualquier cliente o lead por nombre, teléfono o empresa desde cualquier pantalla (atajo: tecla /). Si no existe, lo das de alta ahí mismo.',
      'Botón "+ Nuevo" para crear un contacto, un lead o un recordatorio sin cambiar de pantalla. En el celular, el botón rojo crea lo de la pantalla en la que estás.',
      'El menú sigue el orden del día: Inicio, WhatsApp, Contactos, Leads y Agenda, con el mismo nombre en computadora y celular. "Recordatorios" ahora se llama Agenda y muestra cuántos tienes para hoy.',
      'Leads: pestañas de Abiertos, Ganados y Perdidos, y una columna de Seguimiento que avisa cuáles están vencidos o sin próxima llamada. La ficha abre directo en el seguimiento, con la etapa siempre a la vista.',
      'Al registrar una llamada, visita o cotización, el CRM te propone cuándo volver a contactar al cliente. Una cotización puede actualizar sola el valor del lead.',
      'Ficha del contacto: crea un lead o programa un seguimiento desde ahí, y ve sus leads y pendientes en un solo lugar.',
      'Contactos: un solo buscador, filtros por segmento y canal, y "Exportar" baja exactamente lo que estás viendo. Al importar, las columnas se reconocen solas.',
      'Agenda: pospón un recordatorio con un clic (1 hora, mañana, en 3 días o el lunes) y abre el lead de cada pendiente desde su tarjeta.',
      'Los avisos en el celular se activan ahora en Configuración → Mi cuenta. "Tipo de cliente" se llama Segmento en toda la app.',
    ],
  },
  {
    version: '2.0.0',
    date: '2 de octubre, 2026',
    title: 'Nueva imagen y tu tienda en la nube',
    items: [
      `Nueva imagen: la app ahora se llama CRM Pinturas, el CRM para tiendas de pintura, con una gota de pintura como logo y un diseño en rojo y arcoíris de colores.`,
      'Tu tienda ahora tiene su propio espacio: conserva todos sus clientes, leads y conversaciones, separados de las demás tiendas, con su logo en el menú.',
      'Configuración renovada: datos y logo de la tienda, herramientas activas, catálogos, equipo, WhatsApp y plan, cada uno en su sección.',
      'Invita a tu equipo con un enlace personal que se comparte por WhatsApp; puedes cambiar roles o desactivar accesos cuando quieras.',
      'Nueva sección "Mi cuenta" para cambiar tu nombre y tu contraseña. Al cambiarla se cierra tu sesión en los demás dispositivos.',
      'Si tienes acceso a varias sucursales, cámbiate entre ellas desde el nombre de la tienda en el menú.',
      'Nuevas pantallas para entrar, crear cuenta y recuperar tu contraseña.',
    ],
  },
  {
    version: '1.3.0',
    date: '2 de octubre, 2026',
    title: 'WhatsApp dentro del CRM',
    items: [
      'Nueva bandeja de WhatsApp: lee y responde a tus clientes desde el CRM, con búsqueda, filtros (no leídas, sin contacto) y contador de mensajes sin leer en el menú.',
      'Fotos, audios, videos y documentos se ven directo en el chat, con palomitas de enviado, entregado y leído.',
      'Junto al chat está la ficha del cliente: guarda el número como contacto, crea un lead o programa un recordatorio de seguimiento sin salir de la conversación.',
      'Respuestas rápidas para el equipo (las crea un administrador en Configuración); {nombre} se cambia solo por el nombre del cliente.',
      'Aviso en tu celular cuando un cliente te escribe. Se puede apagar en la campana de notificaciones → "Avisarme cuando llegue un WhatsApp".',
      'Si un cliente escribe BAJA o STOP deja de recibir campañas automáticamente (también se puede marcar a mano en su ficha).',
      'Nueva pestaña "Resultados" en Campañas (administradores): entregados, leídos, respuestas y fallidos por plantilla.',
      'La sección de WhatsApp se rediseñó para verse bien en celular, tablet y computadora.',
      'Mejoras de seguridad y velocidad en toda la app.',
    ],
  },
  {
    version: '1.2.0',
    date: '28 de septiembre, 2026',
    title: 'Panel de campañas en WhatsApp',
    items: [
      'Nueva pestaña "Campañas" dentro de WhatsApp (solo administradores) para elegir contactos y mandar una plantilla aprobada sin pasar por Contactos.',
      'Selector de contactos con buscador y "Elegir todos", más vista previa de la plantilla igual que antes.',
      'Reglas para cuidar el número: pausa de ~3 segundos entre cada envío y tope de 200 plantillas al día, con aviso en pantalla de cuánto queda antes de mandar.',
      'Las plantillas ahora se consultan en vivo directo desde Meta (ya no hay que agregarlas a mano cada vez que se aprueba una nueva).',
      'Filtro por tipo de cliente (Constructor, Arquitecto, Hogar, Empresa, etc.) en el selector de contactos de Campañas.',
      'Ventana de confirmación antes de mandar (con resumen de plantilla, contactos y tiempo estimado) y barra de progreso real mientras se envía.',
    ],
  },
  {
    version: '1.1.0',
    date: '26 de septiembre, 2026',
    title: 'Nueva sección: Fórmulas',
    items: [
      'Nueva sección "Fórmulas" en el menú para igualar colores de Vinipesa Matte (INFINITE 2000) manualmente.',
      'Busca cualquier color por nombre o código y elige el volumen a preparar: Litro, Galón, Cubeta o cualquier cantidad personalizada en litros o mL.',
      'Las cantidades de colorante se muestran ya convertidas a mL, listas para dosificar.',
      'Cada color ahora muestra su muestra de color real (tomada del PDF original) junto al nombre, en la lista y en el detalle.',
      'Fórmulas ahora se ve bien en celular: la búsqueda ya no desaparece, y al elegir un color se abre a pantalla completa con un botón para volver a la lista.',
    ],
  },
  {
    version: '1.0.0',
    date: '6 de agosto, 2026',
    title: 'Roles de administrador y accesos rápidos',
    items: [
      'Nuevo rol de administrador: puede ver y supervisar los leads de todos los usuarios, no solo los propios.',
      'En Configuración → Usuarios se puede asignar quién es administrador, con confirmación antes de aplicar el cambio.',
      'En Recordatorios ahora hay botones para llamar, escribir por WhatsApp o enviar correo directo al contacto vinculado.',
      'El estado "Cerrado" de un lead ahora se llama "Ganado / Venta realizada".',
      'Los filtros de Contactos y Leads se rediseñaron: son más rápidos de usar y ya no fallan en el celular.',
      'Nuevo botón para volver arriba rápidamente cuando llevas mucho scroll en una lista larga.',
      'Botones de llamar, WhatsApp, editar y eliminar con mejor tamaño para tocar desde el celular.',
    ],
  },
]

export const CURRENT_VERSION = CHANGELOG[0].version
