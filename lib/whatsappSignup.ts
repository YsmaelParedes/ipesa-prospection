/**
 * Alta de WhatsApp en unos clics (Embedded Signup de Meta), solo servidor.
 *
 * La tienda abre la ventana de Meta desde Configuración, elige su negocio y
 * su número, y Meta nos devuelve un código de un solo uso (vive 30 s) más los
 * ids de su cuenta (WABA) y de su número. Aquí:
 *   1. se cambia el código por el token de la tienda (con el secreto de la
 *      app de Matices: nunca sale del servidor),
 *   2. se comprueba con ese token que el número sí es de esa cuenta (los ids
 *      vienen del navegador y no se les cree),
 *   3. se guarda todo cifrado, se suscribe la app a la cuenta (así llegan
 *      sus mensajes al webhook central) y se registra el número con un PIN
 *      (salvo coexistencia: el número sigue en WhatsApp Business y ya está
 *      registrado),
 *   4. se enciende WhatsApp en la tienda y, en coexistencia, se pide a Meta
 *      el historial de chats (solo se puede una vez y en las primeras 24 h).
 * Si un paso falla, lo ya hecho queda guardado y la tienda reintenta sin
 * volver a pasar por Meta (POST sin código).
 */
import { randomInt } from 'node:crypto'
import { decryptSecret, encryptSecret, hasEncryptionKey } from './crypto'
import { GRAPH_VERSION, graphFetch } from './whatsapp'
import { externalFetch } from './serverTiming'
import { getServerSupabase, invalidateStoreContextCache, type StoreContext } from './supabase-server'
import { getStoreWhatsAppRow } from './storeWhatsApp'
import { WHATSAPP_OFFERED, planOf } from './stores'
import { META_ID, canRequestHistory, pickPhone, type SignupInput } from './whatsappSignupParse'

export { parseSignupInput, canRequestHistory, type SignupInput } from './whatsappSignupParse'


/**
 * ¿Esta tienda puede conectar WhatsApp sola? Con WHATSAPP_OFFERED, todas las
 * de un plan con WhatsApp; antes, solo las de prueba que estén en
 * WHATSAPP_SIGNUP_STORES (ids separados por coma).
 */
export function whatsappSignupOpen(storeId: string): boolean {
  if (WHATSAPP_OFFERED) return true
  return (process.env.WHATSAPP_SIGNUP_STORES ?? '').split(',').map(s => s.trim()).includes(storeId)
}

/** Lo que la app de Meta necesita para abrir la ventana (todo es público). */
export function signupConfig(): { appId: string; configId: string; version: string } | null {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? ''
  const configId = process.env.NEXT_PUBLIC_WA_CONFIG_ID ?? ''
  return META_ID.test(appId) && META_ID.test(configId) ? { appId, configId, version: GRAPH_VERSION } : null
}

export class SignupError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

type Phone = { id: string; display_phone_number?: string; verified_name?: string; onBizApp?: boolean }

const metaMessage = (data: any) => String(data?.error?.error_user_msg || data?.error?.message || '').slice(0, 300)

async function exchangeCode(code: string): Promise<string> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!appId || !secret) throw new SignupError('La conexión con Meta no está configurada todavía.', 503)
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`)
  url.search = new URLSearchParams({ client_id: appId, client_secret: secret, code }).toString()
  const res = await externalFetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data?.access_token !== 'string') {
    console.error('[whatsapp-signup] no se pudo cambiar el código', res.status, metaMessage(data))
    throw new SignupError('Meta no confirmó la conexión (el permiso caducó). Vuelve a tocar «Conectar con WhatsApp».')
  }
  return data.access_token
}

/** ¿El número también está en la app WhatsApp Business (coexistencia)? */
async function isOnBizApp(token: string, phoneId: string): Promise<boolean> {
  const r = await graphFetch({ token }, `${phoneId}?fields=is_on_biz_app,platform_type`)
  return r.ok && r.data?.is_on_biz_app === true
}

/**
 * El número elegido, comprobado contra la cuenta con el token de la tienda.
 * En coexistencia Meta no dice cuál fue: si hay varios, el que está en la
 * app WhatsApp Business.
 */
async function verifiedPhone(token: string, wabaId: string, wanted: string | null, coexistence: boolean): Promise<Phone> {
  const r = await graphFetch({ token }, `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`)
  if (!r.ok) {
    console.error('[whatsapp-signup] no se pudo leer la cuenta', r.status, metaMessage(r.data))
    throw new SignupError('No pudimos leer tu cuenta de WhatsApp en Meta. Intenta otra vez.', 502)
  }
  let phones: Phone[] = Array.isArray(r.data?.data) ? r.data.data.filter((p: any) => META_ID.test(String(p?.id))) : []
  if (!wanted && coexistence && phones.length > 1) {
    phones = await Promise.all(phones.map(async p => ({ ...p, onBizApp: await isOnBizApp(token, p.id) })))
  }
  const phone = pickPhone(phones, wanted, coexistence)
  if (!phone) throw new SignupError(phones.length > 1 && !wanted
    ? 'Tu cuenta de WhatsApp en Meta tiene varios números y no supimos cuál conectar. Vuelve a conectar con una cuenta que solo tenga el número de tu tienda.'
    : 'Ese número no aparece en tu cuenta de WhatsApp. Vuelve a conectar.')
  return phone
}

const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** Quita la app de Matices de una cuenta de WhatsApp (sin fallar si Meta no responde). */
async function unsubscribe(token: string, wabaId: string, storeId: string) {
  try {
    const r = await graphFetch({ token }, `${wabaId}/subscribed_apps`, { method: 'DELETE' })
    if (!r.ok) console.warn('[whatsapp-signup] Meta no quitó la suscripción', storeId, metaMessage(r.data))
  } catch (error) {
    console.warn('[whatsapp-signup] no se pudo quitar la suscripción', storeId, error)
  }
}

/** Conecta (o retoma) el número de la tienda. Devuelve el estado final. */
export async function connectEmbedded(ctx: StoreContext, input: SignupInput) {
  if (!planOf(ctx.plan).whatsapp) throw new SignupError('WhatsApp está incluido en el plan Cubeta. Cambia de plan para conectarlo.', 402)
  if (!whatsappSignupOpen(ctx.storeId)) throw new SignupError('Conectar WhatsApp estará disponible muy pronto.', 409)
  if (!hasEncryptionKey()) throw new SignupError('La conexión con Meta no está configurada todavía.', 503)

  const db = getServerSupabase()
  const storeId = ctx.storeId
  const row = await getStoreWhatsAppRow(storeId)
  if (!row) throw new SignupError('Configuración de WhatsApp no encontrada', 404)
  if (row.credentials_source === 'env' || (row.connection_method === 'manual' && row.connected_at)) {
    throw new SignupError('Tu tienda ya tiene un número de WhatsApp conectado.', 409)
  }
  // Ya conectado y encendido: para cambiar de número primero se desconecta
  // (así se registra el nuevo, se suelta la cuenta anterior y el historial es del número correcto)
  if (row.connection_method === 'embedded' && row.connected_at && ctx.store.modules?.whatsapp) {
    throw new SignupError('Tu WhatsApp ya está conectado. Para cambiar de número, primero desconéctalo en Configuración › WhatsApp.', 409)
  }

  // 1. Token: del código nuevo o, al reintentar, el que ya se guardó para esa cuenta
  let token: string
  if (input.code) token = await exchangeCode(input.code)
  else if (row.connection_method === 'embedded' && row.access_token_enc && row.waba_id === input.wabaId) token = decryptSecret(row.access_token_enc, storeId)
  else throw new SignupError('Vuelve a tocar «Conectar con WhatsApp» para terminar en Meta.')

  // 2. El número tiene que ser de esa cuenta
  const sameAccount = row.connection_method === 'embedded' && row.waba_id === input.wabaId
  let coexistence = input.coexistence || (sameAccount && row.coexistence)
  const phone = await verifiedPhone(token, input.wabaId, input.phoneNumberId ?? (sameAccount ? row.phone_number_id : null), coexistence)
  if (phone.id === process.env.WHATSAPP_PHONE_NUMBER_ID) throw new SignupError('Ese número ya está conectado a otra tienda de Matices.', 409)
  if (!coexistence) coexistence = phone.onBizApp ?? await isOnBizApp(token, phone.id)

  // Un alta a medias con OTRA cuenta: se suelta la anterior para no seguir recibiendo sus mensajes
  let previous: { token: string; wabaId: string } | null = null
  if (row.connection_method === 'embedded' && row.access_token_enc && row.waba_id && row.waba_id !== input.wabaId) {
    try { previous = { token: decryptSecret(row.access_token_enc, storeId), wabaId: row.waba_id } } catch { /* sin token no hay nada que soltar */ }
  }
  // Mismo número que ya quedó activado: no se vuelve a registrar ni se pierde su historial
  const sameNumber = sameAccount && row.phone_number_id === phone.id

  // 3. Guardar lo obtenido antes de seguir (si algo falla después, se retoma)
  const saved = await db.from('store_whatsapp').update({
    credentials_source: 'store',
    connection_method: 'embedded',
    access_token_enc: encryptSecret(token, storeId),
    app_secret_enc: null,
    phone_number_id: phone.id,
    waba_id: input.wabaId,
    business_id: input.businessId ?? (sameAccount ? row.business_id : null),
    display_phone: phone.display_phone_number ?? null,
    coexistence,
    setup_error: null,
    updated_at: new Date().toISOString(),
    ...(sameNumber ? {} : { connected_at: null, history_status: null, history_requested_at: null, history_imported: 0 }),
  }).eq('store_id', storeId)
  if (saved.error?.code === '23505') throw new SignupError('Ese número ya está conectado a otra tienda de Matices.', 409)
  if (saved.error) throw saved.error
  if (previous) await unsubscribe(previous.token, previous.wabaId, storeId)

  const fail = async (step: string, message: string, data: unknown) => {
    console.error(`[whatsapp-signup] falló ${step}`, storeId, metaMessage(data))
    await db.from('store_whatsapp').update({ setup_error: step, updated_at: new Date().toISOString() }).eq('store_id', storeId)
    throw new SignupError(message, 502)
  }

  // 4. Que los mensajes de esa cuenta lleguen al webhook de Matices
  const sub = await graphFetch({ token }, `${input.wabaId}/subscribed_apps`, { method: 'POST', body: '{}' })
  if (!sub.ok) await fail('subscribe', 'Meta no activó la recepción de mensajes. Intenta otra vez.', sub.data)

  // 5. Número nuevo: registrarlo en la API con un PIN de verificación en dos pasos
  const connectedAt = sameNumber ? row.connected_at : null
  if (!coexistence && !connectedAt) {
    const pin = row.pin_enc ? decryptSecret(row.pin_enc, storeId) : sixDigits()
    if (!row.pin_enc) await db.from('store_whatsapp').update({ pin_enc: encryptSecret(pin, storeId) }).eq('store_id', storeId)
    const reg = await graphFetch({ token }, `${phone.id}/register`, {
      method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    if (!reg.ok) await fail('register', 'Meta no terminó de activar tu número. Revisa que lo hayas verificado con el código e intenta otra vez.', reg.data)
  }

  // 6. Listo: se enciende WhatsApp en la tienda
  const now = new Date().toISOString()
  await db.from('store_whatsapp').update({ connected_at: connectedAt ?? now, setup_error: null, updated_at: now }).eq('store_id', storeId)
  const modules = { ...ctx.store.modules, whatsapp: true }
  const mod = await db.from('stores').update({ modules }).eq('id', storeId)
  if (mod.error) throw mod.error
  invalidateStoreContextCache()

  // 7. Coexistencia: pedir el historial de chats (si falla, la tienda lo vuelve a pedir desde su panel)
  let historyStatus = sameNumber ? row.history_status : null
  const history = { coexistence, connected_at: connectedAt ?? now, history_status: historyStatus }
  if (canRequestHistory(history)) historyStatus = await requestHistory(storeId, token, phone.id)

  return { connected: true, displayPhone: phone.display_phone_number ?? null, coexistence, historyStatus }
}

/**
 * Pide a Meta el historial de chats de un número en coexistencia. Llega
 * después por el webhook (campo history). Solo se puede en las primeras 24 h.
 */
async function requestHistory(storeId: string, token: string, phoneId: string): Promise<'requested' | 'failed'> {
  const h = await graphFetch({ token }, `${phoneId}/smb_app_data`, {
    method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: 'history' }),
  })
  const status = h.ok ? 'requested' : 'failed'
  if (!h.ok) console.error('[whatsapp-signup] no se pidió el historial', storeId, metaMessage(h.data))
  const now = new Date().toISOString()
  await getServerSupabase().from('store_whatsapp')
    .update({ history_status: status, history_requested_at: now, updated_at: now }).eq('store_id', storeId)
  return status
}

/** La tienda vuelve a pedir su historial (no se pidió o falló, y aún está en las 24 h). */
export async function retryHistory(ctx: StoreContext) {
  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (!row || row.connection_method !== 'embedded' || !row.access_token_enc || !row.phone_number_id) {
    throw new SignupError('Tu WhatsApp no está conectado.', 409)
  }
  if (!canRequestHistory(row)) {
    throw new SignupError('Meta solo deja traer tus chats anteriores en las primeras 24 horas después de conectar.', 409)
  }
  const status = await requestHistory(ctx.storeId, decryptSecret(row.access_token_enc, ctx.storeId), row.phone_number_id)
  if (status === 'failed') throw new SignupError('Meta no aceptó la solicitud de tus chats. Intenta otra vez en unos minutos.', 502)
  return { status }
}

/**
 * Desconecta un número dado de alta por la tienda: Matices deja de recibir
 * sus mensajes y se apaga WhatsApp. Los chats guardados se quedan. El número
 * sigue siendo de la tienda en Meta (y en su celular, si usa coexistencia).
 */
export async function disconnectEmbedded(ctx: StoreContext) {
  const db = getServerSupabase()
  const row = await getStoreWhatsAppRow(ctx.storeId)
  if (!row || row.connection_method !== 'embedded') throw new SignupError('Este número lo conectó tu asesor. Escríbenos para cambiarlo.', 409)
  if (row.access_token_enc && row.waba_id) {
    let token: string | null = null
    try { token = decryptSecret(row.access_token_enc, ctx.storeId) } catch (error) {
      console.warn('[whatsapp-signup] no se pudo descifrar el token al desconectar', ctx.storeId, error)
    }
    if (token) await unsubscribe(token, row.waba_id, ctx.storeId)
  }
  await clearEmbedded(ctx.storeId, ctx.store.modules)
}

/** Borra la conexión y apaga el módulo (también cuando la tienda quita a Matices desde Meta). */
export async function clearEmbedded(storeId: string, modules?: Record<string, boolean>) {
  const db = getServerSupabase()
  const { error } = await db.from('store_whatsapp').update({
    connection_method: 'manual', access_token_enc: null, app_secret_enc: null, phone_number_id: null, waba_id: null,
    business_id: null, display_phone: null, coexistence: false, pin_enc: null, connected_at: null, setup_error: null,
    history_status: null, history_requested_at: null, history_imported: 0, updated_at: new Date().toISOString(),
  }).eq('store_id', storeId)
  if (error) throw error
  let current = modules
  if (!current) {
    const { data } = await db.from('stores').select('modules').eq('id', storeId).maybeSingle()
    current = (data?.modules ?? {}) as Record<string, boolean>
  }
  const off = await db.from('stores').update({ modules: { ...current, whatsapp: false } }).eq('id', storeId)
  if (off.error) throw off.error
  invalidateStoreContextCache()
}
