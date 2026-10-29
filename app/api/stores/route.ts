import { NextRequest, NextResponse } from 'next/server'
import { getMemberships, requireUser } from '@/lib/supabase-server'
import { STORE_PROFILE_SCHEMA, createStore, publicStore, setActiveStoreCookie } from '@/lib/storeServer'
import { clientIp, DAY, HOUR, limitShared, tooMany } from '@/lib/rateLimit'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

/**
 * POST /api/stores — alta de la tienda de una cuenta nueva (asistente
 * /bienvenida). Quien la crea queda como administrador y la tienda nace en el
 * plan Litro (gratis). Una sola tienda por cuenta: quien ya pertenece a una
 * tienda no puede abrir otra.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof Response) return user
  if (!(await limitShared([
    { key: `stores:ip:${clientIp(req)}`, max: 5, windowMs: HOUR },
    { key: `stores:user:${user.id}`, max: 5, windowMs: DAY },
  ]))) return tooMany('Demasiadas altas desde esta conexión. Intenta más tarde.', 60 * 60)

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, STORE_PROFILE_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (String(parsed.data.name).trim().length < 3) return jsonError('El nombre de la tienda es muy corto')

  try {
    if ((await getMemberships(user.id)).length > 0) {
      return jsonError('Tu cuenta ya pertenece a una tienda. Para abrir otra sucursal, escríbenos.', 403)
    }
    const store = await createStore(user.id, parsed.data)
    await setActiveStoreCookie(store.id)
    return NextResponse.json({ store: publicStore(store) }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/stores', error, 'No se pudo crear la tienda')
  }
}
