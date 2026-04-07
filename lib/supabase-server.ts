import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabaseServer: SupabaseClient | null = null

/**
 * Server-side Supabase client using service role key.
 * Use this in API routes and server components only.
 * Falls back to anon key if service role key is not available.
 */
export function getServerSupabase(): SupabaseClient {
  if (!_supabaseServer) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('[project-id]')) {
      throw new Error('Supabase credentials not configured. Update .env.local with your project URL and service role key.')
    }

    _supabaseServer = createClient(supabaseUrl, supabaseKey)
  }
  return _supabaseServer
}
