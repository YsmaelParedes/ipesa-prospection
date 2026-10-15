import { getServerSupabase } from './supabase-server'

/**
 * Bitácora del panel del dueño (tabla platform_events): quién hizo qué con
 * cada tienda. Los pagos y anulaciones los registra la propia base en la
 * misma transacción; aquí van el resto de las acciones. Si falla, no
 * bloquea la acción (solo se reporta en el log del servidor).
 */
export async function logPlatformEvent(storeId: string, actorId: string, action: string, detail: Record<string, unknown> = {}) {
  const { error } = await getServerSupabase().from('platform_events').insert({ store_id: storeId, actor_id: actorId, action, detail })
  if (error) console.error('[platform_events]', action, error.message)
}

/** Errores que lanzan record_store_payment / void_store_payment con un mensaje para el usuario. */
export function rpcUserError(error: { code?: string; message?: string } | null): { status: number; message: string } | null {
  if (error?.code === 'P0001') return { status: 409, message: error.message ?? 'No se pudo completar' }
  if (error?.code === 'P0002') return { status: 404, message: error.message ?? 'No encontrado' }
  return null
}
