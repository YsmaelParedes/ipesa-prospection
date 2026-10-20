import { getServerSupabase } from './supabase-server'

/** A lease is shared by Checkout and subscription sync across all instances.
 * Every database write also checks the token: an expired worker cannot commit.
 */
export async function withStripeStoreLock<T>(storeId: string, work: (token: string) => Promise<T>): Promise<T> {
  const db = getServerSupabase()
  const { data: token, error } = await db.rpc('claim_stripe_store', { p_store: storeId })
  if (error) throw error
  if (!token) throw new Error('Hay otra operación de cobro en curso. Intenta de nuevo.')
  try {
    return await work(token as string)
  } finally {
    // Failure to release must not mask the original error; the lease expires.
    try {
      const { error: releaseError } = await db.rpc('release_stripe_store', { p_store: storeId, p_token: token })
      if (releaseError) throw releaseError
    } catch {
      console.error('[stripe/lock] No se pudo liberar el bloqueo')
    }
  }
}

export async function assertStripeStoreLock(storeId: string, token: string): Promise<void> {
  const { error } = await getServerSupabase().rpc('assert_stripe_store_lock', { p_store: storeId, p_token: token })
  if (error) throw error
}
