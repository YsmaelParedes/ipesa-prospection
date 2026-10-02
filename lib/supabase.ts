import { createBrowserClient } from '@supabase/ssr'

/** Cliente Supabase para Client Components (solo Auth; los datos van por /api). */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
