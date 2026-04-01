import { NextRequest, NextResponse } from 'next/server'

const YCLOUD_API_KEY = process.env.YCLOUD_API_KEY!
const PHONE_NUMBER_ID = process.env.YCLOUD_PHONE_NUMBER_ID!

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('52') && digits.length === 12) return `+${digits}`
  if (digits.length === 10) return `+52${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+52${digits.slice(1)}`
  return `+${digits}`
}

export async function POST(req: NextRequest) {
  try {
    const { phone, templateName, language, variables } = await req.json()
    if (!phone) return NextResponse.json({ error: 'Teléfono requerido' }, { status: 400 })
    if (!YCLOUD_API_KEY) return NextResponse.json({ error: 'YCLOUD_API_KEY no configurada' }, { status: 500 })

    const to = formatPhone(phone)

    const body: any = {
      from: PHONE_NUMBER_ID,
      to,
      type: 'template',
      template: {
        name: templateName || 'template_marketing',
        language: { code: language || 'es' },
        components: [],
      },
    }

    if (variables?.length) {
      body.template.components = [{
        type: 'body',
        parameters: variables.map((v: string) => ({ type: 'text', text: v })),
      }]
    }

    const res = await fetch('https://api.ycloud.com/v2/whatsapp/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': YCLOUD_API_KEY,
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message || data.error || 'Error YCloud', detail: data },
        { status: res.status }
      )
    }

    return NextResponse.json({ success: true, messageId: data.id })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
