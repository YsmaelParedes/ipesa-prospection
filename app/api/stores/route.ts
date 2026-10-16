import { jsonError } from '@/lib/validation'

/**
 * POST /api/stores — CERRADO: cada cuenta tiene una sola tienda. Las tiendas
 * (y cualquier sucursal adicional) las da de alta el dueño de la plataforma
 * desde su panel (POST /api/platform/stores), con su propio dueño y equipo.
 */
export async function POST() {
  return jsonError('Cada cuenta tiene una sola tienda. Para abrir otra sucursal, escríbenos.', 403)
}
