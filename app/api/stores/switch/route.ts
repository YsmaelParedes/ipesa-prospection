import { NextRequest, NextResponse } from 'next/server'
import { getMemberships, requireUser } from '@/lib/supabase-server'
import { setActiveStoreCookie } from '@/lib/storeServer'
import { isUUID, jsonError, readJson } from '@/lib/validation'

// POST /api/stores/switch { storeId } — cambiar de tienda (solo a una de la que es miembro)
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof Response) return user

  const body = await readJson(req)
  const storeId = body?.storeId
  if (!isUUID(storeId)) return jsonError('Tienda inválida')
  const memberships = await getMemberships(user.id)
  if (!memberships.some(m => m.storeId === storeId)) return jsonError('Tienda no encontrada', 404)

  await setActiveStoreCookie(storeId)
  return NextResponse.json({ ok: true })
}
