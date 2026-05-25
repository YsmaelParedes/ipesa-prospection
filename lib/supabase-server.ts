import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SVC  = process.env.SUPABASE_SERVICE_KEY ?? SUPABASE_ANON

/** Cliente con service key para operaciones de datos en API routes */
export function getServerSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SVC, { auth: { persistSession: false } })
}

/** Cliente auth-aware con cookies (para verificar sesión en Server Components) */
export async function getAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
}
