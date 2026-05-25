import { createBrowserClient } from '@supabase/ssr'

/** Cliente Supabase para uso en Client Components */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
