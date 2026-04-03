import { NextRequest, NextResponse } from 'next/server'

const API_KEY  = process.env.SMS_MASIVOS_API_KEY!
const BASE_URL = 'https://api.smsmasivos.com.mx'

// SMS Masivos status codes
export const SMS_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Entregado',  color: 'green'  },
  2: { label: 'Fallido',    color: 'red'    },
  3: { label: 'Pendiente',  color: 'yellow' },
  4: { label: 'Expirado',   color: 'gray'   },
  5: { label: 'Rechazado',  color: 'red'    },
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) return NextResponse.json({ error: 'SMS_MASIVOS_API_KEY no configurada' }, { status: 500 })

    const { start_date, end_date } = await req.json()
    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date y end_date son requeridos' }, { status: 400 })
    }

    const res = await fetch(`${BASE_URL}/reports/generate`, {
      method: 'POST',
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ start_date, end_date }),
      cache: 'no-store',
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message || 'Error al generar reporte' }, { status: res.status })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
