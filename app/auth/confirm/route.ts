import { type NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import type { EmailOtpType, User } from '@supabase/supabase-js'
import { getAuthClient } from '@/lib/supabase-server'
import { grantPasswordReset } from '@/lib/passwordReset'
import { safeNext } from '@/lib/safeNext'

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
const RESET_PAGE = '/restablecer'

/**
 * GET /auth/confirm — destino de los enlaces de los correos de Supabase
 * (confirmar cuenta, restablecer contraseña). Acepta:
 *   · ?token_hash=…&type=… (plantillas recomendadas: funciona en cualquier dispositivo)
 *   · ?code=…              (plantilla por defecto: mismo navegador que lo pidió)
 * Un enlace de recuperación válido además habilita, por 15 minutos, cambiar
 * la contraseña sin escribir la actual (lib/passwordReset.ts).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = safeNext(params.get('next'))
  const tokenHash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null
  const code = params.get('code')

  const supabase = await getAuthClient()
  let user: User | null = null
  let recovery = false
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) user = data.user
    recovery = type === 'recovery'
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) user = data.user
    // El flujo con "code" no informa el tipo: el correo de recuperación vuelve a /restablecer
    recovery = next === RESET_PAGE
  }
  if (!user) redirect('/login?error=enlace')
  if (recovery) await grantPasswordReset(user.id)
  redirect(recovery ? RESET_PAGE : next)
}
