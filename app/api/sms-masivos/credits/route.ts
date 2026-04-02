import { NextResponse } from 'next/server'

const API_KEY  = process.env.SMS_MASIVOS_API_KEY!
const BASE_URL = 'https://api.smsmasivos.com.mx'

export async function GET() {
  try {
    if (!API_KEY) return NextResponse.json({ error: 'SMS_MASIVOS_API_KEY no configurada' }, { status: 500 })

    const res = await fetch(`${BASE_URL}/credits/consult`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message || 'Error al consultar créditos' }, { status: res.status })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
