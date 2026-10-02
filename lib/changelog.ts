import { APP_NAME } from './brand'

/**
 * Notas de versión — un usuario ve el modal automáticamente la primera vez
 * que entra después de que se agrega una entrada nueva (comparado contra
 * localStorage). CURRENT_VERSION debe coincidir con el id de la entrada
 * más reciente.
 */
export type ChangelogEntry = {
  version: string
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026-10-02.3',
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
    version: '2026-10-02.2',
    date: '2 de octubre, 2026',
    title: 'Nueva imagen y tu tienda en la nube',
    items: [
      `Nueva imagen: la app ahora se llama ${APP_NAME}, el CRM para tiendas de pintura, con una gota de pintura como logo y un diseño en rojo y arcoíris de colores.`,
      'Tu tienda ahora tiene su propio espacio: conserva todos sus clientes, leads y conversaciones, separados de las demás tiendas, con su logo en el menú.',
      'Configuración renovada: datos y logo de la tienda, herramientas activas, catálogos, equipo, WhatsApp y plan, cada uno en su sección.',
      'Invita a tu equipo con un enlace personal que se comparte por WhatsApp; puedes cambiar roles o desactivar accesos cuando quieras.',
      'Nueva sección "Mi cuenta" para cambiar tu nombre y tu contraseña. Al cambiarla se cierra tu sesión en los demás dispositivos.',
      'Si tienes acceso a varias sucursales, cámbiate entre ellas desde el nombre de la tienda en el menú.',
      'Nuevas pantallas para entrar, crear cuenta y recuperar tu contraseña.',
    ],
  },
  {
    version: '2026-10-02',
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
    version: '2026-09-28',
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
    version: '2026-09-26',
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
    version: '2026-08-06',
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
