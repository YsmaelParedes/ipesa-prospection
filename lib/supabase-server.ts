import { createClient } from '@supabase/supabase-js'

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_KEY!
  if (!url || !key) throw new Error('Supabase server credentials not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}
