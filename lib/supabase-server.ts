import { createClient } from '@supabase/supabase-js'

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase credentials not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  return createClient(url, key, { auth: { persistSession: false } })
}
