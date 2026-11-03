import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ACTIVE_STORE_COOKIE, forgetSessionUser } from '@/lib/supabase-server'
import { SESSION_COOKIE_OPTIONS } from '@/lib/sessionCookie'

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
      },
    }
  )

  await forgetSessionUser()
  await supabase.auth.signOut()
  // La tienda activa es una preferencia del navegador: se olvida al salir
  res.cookies.delete(ACTIVE_STORE_COOKIE)
  res.cookies.delete('crm_pw_reset')
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Clear-Site-Data', '"cache"')
  return res
}
