import { NextRequest, NextResponse } from 'next/server'

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN!
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER!

// Códigos de error Twilio con mensajes amigables
const TWILIO_ERRORS: Record<number, string> = {
  21211: 'Número de teléfono inválido',
  21610: 'Número en lista de opt-out (bloqueó mensajes)',
  21614: 'Número no es SMS-capable',
  30003: 'Número no disponible (apagado o fuera de cobertura)',
  30004: 'Mensaje bloqueado por el destinatario',
  30005: 'Número desconocido — no existe en la red',
  30006: 'Número de línea fija — no recibe SMS',
  30007: 'Mensaje bloqueado por filtro anti-spam del operador',
  30008: 'Error del operador — reintenta más tarde',
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+52${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+52${digits.slice(1)}`
  return `+${digits}`
}

export async function POST(req: NextRequest) {
  try {
    const { phone, message } = await req.json()

    if (!phone)   return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
    if (!message) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    if (!ACCOUNT_SID) return NextResponse.json({ error: 'TWILIO_ACCOUNT_SID no configurada' }, { status: 500 })

    const to = formatPhone(phone)

    const params = new URLSearchParams()
    params.append('To',   to)
    params.append('From', FROM_NUMBER)
    params.append('Body', message)

    const credentials = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: params.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      const friendlyMsg = data.code ? (TWILIO_ERRORS[data.code] ?? data.message) : data.message
      return NextResponse.json(
        { error: friendlyMsg, code: data.code, detail: data },
        { status: res.status }
      )
    }

    return NextResponse.json({ success: true, messageId: data.sid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
