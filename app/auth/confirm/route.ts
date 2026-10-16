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
    const flowId = params.get('sb_flow_id')
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
    if (!error) user = data.user
    // Ni `next` ni redirectType (almacenado en el navegador) conceden permisos.
    // La prueba de recuperación debe venir del JWT firmado por Supabase.
    if (!error && data.session) {
      const { data: verified, error: claimsError } = await supabase.auth.getClaims(data.session.access_token)
      const methods = verified?.claims.amr
      const now = Math.floor(Date.now() / 1000)
      recovery = !claimsError && verified?.claims.sub === user?.id && Array.isArray(methods)
        && methods.some(m => typeof m === 'object' && m.method === 'recovery'
          && typeof m.timestamp === 'number' && m.timestamp <= now + 60
          && m.timestamp > now - 15 * 60)
    }
  }
  if (!user) redirect('/login?error=enlace')
  if (recovery) await grantPasswordReset(user.id)
  redirect(recovery ? RESET_PAGE : next)
}
