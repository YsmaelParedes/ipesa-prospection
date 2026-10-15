import { NextRequest, NextResponse } from 'next/server'
import { getMemberships, isPlatformAdmin, requireUser } from '@/lib/supabase-server'
import { STORE_PROFILE_SCHEMA, provisionStore, publicStore, setActiveStoreCookie } from '@/lib/storeServer'
import { jsonError, parseFields, readJson, serverError } from '@/lib/validation'

// Un mismo usuario puede abrir pocas tiendas por su cuenta (evita abuso de pruebas)
const MAX_OWNED_STORES = 3

/**
 * POST /api/stores — sucursal nueva de un dueño que ya tiene tienda
 * (asistente /bienvenida?nueva=1). Quien la crea queda como dueño; nace
 * "Por activar" (solo lectura hasta su primer pago). Las tiendas nuevas
 * entran solo por invitación desde el panel del dueño: una cuenta sin tienda
 * (p. ej. creada directo con la llave pública de Supabase) no puede abrir una.
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
    if (owned === 0 && !(await isPlatformAdmin(user.id))) {
      return jsonError('Por ahora las tiendas nuevas se dan de alta solo por invitación.', 403)
    }
    if (owned >= MAX_OWNED_STORES) return jsonError('Ya alcanzaste el máximo de tiendas por cuenta. Escríbenos para abrir otra.', 403)

    const store = await provisionStore(user, parsed.data)
    await setActiveStoreCookie(store.id)
    return NextResponse.json({ store: publicStore(store) }, { status: 201 })
  } catch (error) {
    return serverError('POST /api/stores', error, 'No se pudo crear la tienda')
  }
}
