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
    version: '2026-09-28',
    date: '28 de septiembre, 2026',
    title: 'Panel de campañas en WhatsApp',
    items: [
      'Nueva pestaña "Campañas" dentro de WhatsApp (solo administradores) para elegir contactos y mandar una plantilla aprobada sin pasar por Contactos.',
      'Selector de contactos con buscador y "Elegir todos", más vista previa de la plantilla igual que antes.',
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
