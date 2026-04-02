import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.SMS_MASIVOS_API_KEY!
const BASE_URL = 'https://api.smsmasivos.com.mx'

// Extrae los 10 dígitos del número mexicano
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length === 12) return digits.slice(2)
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits
}

export async function POST(req: NextRequest) {
  try {
    const { phone, message } = await req.json()

    if (!phone)   return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
    if (!message) return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
    if (!API_KEY) return NextResponse.json({ error: 'SMS_MASIVOS_API_KEY no configurada' }, { status: 500 })

    const number = formatPhone(phone)

    const res = await fetch(`${BASE_URL}/sms/send`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        numbers: number,
        message,
        country_code: '52',
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.error || 'Error SMS Masivos', detail: data },
        { status: res.status }
      )
    }

    return NextResponse.json({ success: true, messageId: data.id ?? data.message })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
