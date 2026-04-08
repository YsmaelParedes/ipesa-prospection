import { NextResponse } from 'next/server'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN

/**
 * GET /api/twilio/templates-debug
 * Devuelve la respuesta RAW de Twilio ContentAndApprovals para diagnosticar
 * por qué una plantilla aprobada no se puede seleccionar.
 * ⚠️  Solo usar en desarrollo — eliminar en producción.
 */
export async function GET() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    return NextResponse.json({ error: 'Credenciales Twilio no configuradas' }, { status: 500 })
  }

  const res = await fetch('https://content.twilio.com/v1/ContentAndApprovals?PageSize=200', {
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
    },
    cache: 'no-store',
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.message, raw: data }, { status: res.status })
  }

  // Resumir solo los campos de aprobación para diagnóstico
  const summary = (data.contents || []).map((t: any) => ({
    sid:              t.sid,
    friendly_name:    t.friendly_name,
    language:         t.language,
    approvals:        t.approvals,
    approval_requests: t.approval_requests,
    // Por si Twilio cambia la estructura en el futuro
    raw_keys:         Object.keys(t),
  }))

  return NextResponse.json({ total: summary.length, templates: summary })
}
