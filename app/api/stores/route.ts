import { NextRequest, NextResponse } from 'next/server'
import { getMemberships, requireUser } from '@/lib/supabase-server'
import { STORE_PROFILE_SCHEMA, provisionStore, publicStore, setActiveStoreCookie } from '@/lib/storeServer'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

// Un mismo usuario puede abrir pocas tiendas por su cuenta (evita abuso de pruebas)
const MAX_OWNED_STORES = 3

/**
 * POST /api/stores — alta de una tienda nueva (paso 1 del asistente).
 * Quien la crea queda como dueño; arranca en prueba gratis.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (user instanceof Response) return user

  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const parsed = parseFields(body, STORE_PROFILE_SCHEMA)
  if (!parsed.ok) return jsonError(parsed.error)
  if (String(parsed.data.name).length < 3) return jsonError('El nombre de la tienda es muy corto')

  try {
    const owned = (await getMemberships(user.id)).filter(m => m.role === 'owner').length
    if (owned >= MAX_OWNED_STORES) return jsonError('Ya alcanzaste el máximo de tiendas por cuenta. Escríbenos para abrir otra.', 403)

    const store = await provisionStore(user, parsed.data)
    await setActiveStoreCookie(store.id)
    return NextResponse.json({ store: publicStore(store) }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/stores', error, 'No se pudo crear la tienda')
  }
}
