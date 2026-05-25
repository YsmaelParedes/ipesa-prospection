import { createSupabaseBrowser } from './supabase'

/**
 * Obtiene el display_name del usuario actual desde user_metadata.
 * Fallback: prefijo del email → 'Staff'
 */
export async function getDisplayName(): Promise<string> {
  const supabase = createSupabaseBrowser()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'Staff'

  return (user.user_metadata?.display_name as string)?.trim()
    || user.email?.split('@')[0]
    || 'Staff'
}
