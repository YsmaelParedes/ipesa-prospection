import { NextResponse } from 'next/server'

export async function GET() {
  const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY
  if (!YCLOUD_API_KEY) {
    return NextResponse.json(
      { error: 'YCLOUD_API_KEY no está configurada en las variables de entorno del servidor' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch('https://api.ycloud.com/v2/whatsapp/templates?pageSize=50', {
      headers: { 'X-API-Key': YCLOUD_API_KEY },
      cache: 'no-store',
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || `YCloud respondió ${res.status}`)
    const approved = (data.items || []).filter((t: any) => t.status === 'APPROVED')
    return NextResponse.json({ templates: approved })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
