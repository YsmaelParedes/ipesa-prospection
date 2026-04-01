import { NextResponse } from 'next/server'

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY!

export async function GET() {
  try {
    const res = await fetch('https://api.ycloud.com/v2/whatsapp/templates?pageSize=50', {
      headers: { 'X-API-Key': YCLOUD_API_KEY },
      next: { revalidate: 300 },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Error al obtener plantillas')
    const approved = (data.items || []).filter((t: any) => t.status === 'APPROVED')
    return NextResponse.json({ templates: approved })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
