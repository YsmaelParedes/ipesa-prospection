import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getAuthClient } from '@/lib/supabase-server'
import { safeNext } from '@/lib/rateLimit'

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

/**
 * GET /auth/confirm — destino de los enlaces de los correos de Supabase
 * (confirmar cuenta, restablecer contraseña). Acepta:
 *   · ?token_hash=…&type=… (plantillas recomendadas: funciona en cualquier dispositivo)
 *   · ?code=…              (plantilla por defecto: mismo navegador que lo pidió)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = safeNext(params.get('next'))
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const code = params.get('code')

  const supabase = await getAuthClient()
  let ok = false
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  }
  redirect(ok ? next : `/login?error=enlace`)
}
