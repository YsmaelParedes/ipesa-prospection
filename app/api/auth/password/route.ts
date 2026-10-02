import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, getSessionUser, unauthorizedResponse } from '@/lib/supabase-server'
import { passwordProblem } from '@/lib/invitations'
import { jsonError, readJson } from '@/lib/validation'

// POST /api/auth/password { password } — nueva contraseña (sesión normal o de recuperación)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const body = await readJson(req)
  const problem = passwordProblem(body?.password)
  if (problem) return jsonError(problem)

  const supabase = await getAuthClient()
  const { error } = await supabase.auth.updateUser({ password: body!.password as string })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('different from the old')) return jsonError('La nueva contraseña debe ser distinta a la anterior')
    if (msg.includes('password')) return jsonError('Esa contraseña no cumple los requisitos de seguridad.')
    console.error('[POST /api/auth/password]', error.message)
    return jsonError('No se pudo cambiar la contraseña', 500)
  }
  return NextResponse.json({ ok: true })
}
