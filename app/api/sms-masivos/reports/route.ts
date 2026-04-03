import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const API_KEY  = process.env.SMS_MASIVOS_API_KEY!
const BASE_URL = 'https://api.smsmasivos.com.mx'

// Status codes reales de SMS Masivos API v2
export const SMS_STATUS: Record<number, { label: string; color: string }> = {
  0: { label: 'Entregado',        color: 'green'  },
  1: { label: 'No entregado',     color: 'red'    },
  2: { label: 'Error',            color: 'red'    },
  3: { label: 'Expirado',         color: 'gray'   },
  4: { label: 'Rechazado',        color: 'red'    },
  5: { label: 'Desconocido',      color: 'gray'   },
  6: { label: 'No encontrado',    color: 'gray'   },
  7: { label: 'Formato inválido', color: 'red'    },
  8: { label: 'Pendiente',        color: 'yellow' },
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
      headers: { 'apikey': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date, end_date, lang: 'es' }),
      cache: 'no-store',
    })

    const data = await res.json()

    if (!res.ok || data.success === false) {
      return NextResponse.json({ error: data.message || 'Error al generar reporte' }, { status: 429 })
    }

    const report: any[] = Array.isArray(data) ? data : (data.report ?? data.data ?? data.messages ?? [])

    if (!report.length) return NextResponse.json({ report: [] })

    if (!report.length) return NextResponse.json({ report: [] })

    // ── Enriquecer con datos de contacto desde Supabase ──────────────────
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const sb = createClient(supabaseUrl, supabaseKey)

      const phones = [...new Set(report.map(r => String(r.number).replace(/\D/g, '').slice(-10)))]
      const { data: contacts } = await sb
        .from('contacts')
        .select('name, phone, company, segment, prospect_status')
        .in('phone', phones)

      const contactMap = new Map<string, any>()
      for (const c of contacts ?? []) {
        contactMap.set(String(c.phone).replace(/\D/g, '').slice(-10), c)
      }

      const enriched = report.map(r => {
        const phone = String(r.number).replace(/\D/g, '').slice(-10)
        const contact = contactMap.get(phone) ?? null
        return { ...r, contact }
      })

      return NextResponse.json({ report: enriched })
    } catch {
      // Si falla Supabase, devolver sin enriquecer
      return NextResponse.json({ report })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
