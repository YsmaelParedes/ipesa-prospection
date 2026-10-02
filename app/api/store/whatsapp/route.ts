import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, requireStore } from '@/lib/supabase-server'
import { encryptSecret, hasEncryptionKey } from '@/lib/crypto'
import { credsFromRow, getStoreWhatsAppRow } from '@/lib/storeWhatsApp'
import { graphFetch } from '@/lib/whatsapp'
import { siteOrigin } from '@/lib/invitations'
import { jsonError, readJson, serverError } from '@/lib/validation'

/**
 * Conexión del número de WhatsApp de la tienda (dueño/admin).
 * Cada tienda usa su propia app de Meta: aquí guarda su token permanente,
 * el id del número, el id de la cuenta (WABA) y el app secret. Los secretos
 * se cifran antes de llegar a la base y nunca vuelven al navegador.
 */

// GET — estado de la conexión y datos para configurar el webhook en Meta
export async function GET(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx

  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (!row) return jsonError('Configuración de WhatsApp no encontrada', 404)
  const creds = credsFromRow(row)
  const origin = siteOrigin(req.nextUrl.origin)
  const envSource = row.credentials_source === 'env'

  return NextResponse.json({
    connected: !!creds,
    source: row.credentials_source,
    phoneNumberId: envSource ? null : row.phone_number_id,
    wabaId: envSource ? null : row.waba_id,
    displayPhone: row.display_phone,
    hasAppSecret: !!creds?.appSecret,
    connectedAt: row.connected_at,
    encryptionReady: hasEncryptionKey(),
    // La tienda original sigue en el webhook del servidor; las demás tienen el suyo
    webhook: envSource
      ? { url: `${origin}/api/webhooks/whatsapp`, verifyToken: null }
      : { url: `${origin}/api/webhooks/whatsapp/${row.webhook_key}`, verifyToken: row.verify_token },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

const DIGITS = /^\d{5,30}$/

// PUT — { accessToken, phoneNumberId, wabaId, appSecret } verifica con Meta y guarda cifrado
export async function PUT(req: NextRequest) {
  const ctx = await requireStore({ admin: true })
  if (ctx instanceof Response) return ctx
  if (!hasEncryptionKey()) {
    return jsonError('El servidor aún no tiene configurada la llave de cifrado (CREDENTIALS_ENCRYPTION_KEY). Avisa al administrador de la plataforma.', 503)
  }

  const body = await readJson(req)
  const accessToken   = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''
  const phoneNumberId = typeof body?.phoneNumberId === 'string' ? body.phoneNumberId.trim() : ''
  const wabaId        = typeof body?.wabaId === 'string' ? body.wabaId.trim() : ''
  const appSecret     = typeof body?.appSecret === 'string' ? body.appSecret.trim() : ''

  if (accessToken.length < 30 || accessToken.length > 1000 || /\s/.test(accessToken)) return jsonError('El token de acceso no es válido')
  if (!DIGITS.test(phoneNumberId)) return jsonError('El identificador del número (Phone number ID) debe ser numérico')
  if (!DIGITS.test(wabaId)) return jsonError('El identificador de la cuenta (WABA ID) debe ser numérico')
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) return jsonError('La clave secreta de la app (App Secret) debe tener 32 caracteres hexadecimales')
  // El número del servidor solo lo puede tomar la tienda que ya lo usa
  if (phoneNumberId === process.env.WHATSAPP_PHONE_NUMBER_ID && (await getStoreWhatsAppRow(ctx.storeId))?.credentials_source !== 'env') {
    return jsonError('Ese número ya está conectado en otra tienda', 409)
  }

  // Prueba real: el token debe tener acceso a ese número y a esa cuenta
  const creds = { token: accessToken }
  const [phone, numbers] = await Promise.all([
    graphFetch(creds, `${phoneNumberId}?fields=display_phone_number,verified_name`).catch(() => null),
    graphFetch(creds, `${wabaId}/phone_numbers?fields=id&limit=100`).catch(() => null),
  ])
  if (!phone?.ok) return jsonError('Meta rechazó el token o el número. Revisa que el token sea permanente y tenga permiso whatsapp_business_messaging.', 422)
  if (!numbers?.ok || !(numbers.data?.data ?? []).some((n: any) => String(n?.id) === phoneNumberId)) {
    return jsonError('Ese número no pertenece a la cuenta de WhatsApp Business indicada.', 422)
  }

  try {
    const { error } = await getServerSupabase().from('store_whatsapp').update({
      credentials_source: 'store',
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      display_phone: phone.data?.display_phone_number ?? null,
      access_token_enc: encryptSecret(accessToken, ctx.storeId),
      app_secret_enc: encryptSecret(appSecret, ctx.storeId),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('store_id', ctx.storeId)
    if (error) {
      if (error.code === '23505') return jsonError('Ese número ya está conectado en otra tienda', 409)
      throw error
    }
    return NextResponse.json({ ok: true, displayPhone: phone.data?.display_phone_number ?? null, verifiedName: phone.data?.verified_name ?? null })
  } catch (error) {
    return serverError('PUT /api/store/whatsapp', error, 'No se pudo guardar la conexión')
  }
}

// DELETE — desconectar (borra las credenciales cifradas). Solo el dueño.
export async function DELETE() {
  const ctx = await requireStore({ owner: true })
  if (ctx instanceof Response) return ctx
  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (row?.credentials_source === 'env') return jsonError('Esta tienda usa la conexión del servidor; se administra desde las variables de entorno.', 409)

  const { error } = await getServerSupabase().from('store_whatsapp').update({
    phone_number_id: null, waba_id: null, display_phone: null,
    access_token_enc: null, app_secret_enc: null, connected_at: null,
    updated_at: new Date().toISOString(),
  }).eq('store_id', ctx.storeId)
  if (error) return serverError('DELETE /api/store/whatsapp', error, 'No se pudo desconectar')
  return NextResponse.json({ ok: true })
}
