import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function normalizePhone(phone: string): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('52') && d.length === 12) return d.slice(2)
  if (d.length === 10) return d
  if (d.length > 10) return d.slice(-10)
  return d
}

export async function POST(req: NextRequest) {
  try {
    const { phones = [], names = [], inegi_ids = [] } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const existingPhones: string[] = []
    const existingNames: string[] = []
    const existingInegiIds: string[] = []

    // ── Capa 1: comparación por teléfono (normalizado) ───────────────────────
    if (phones.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('phone')
        .not('phone', 'is', null)
        .neq('phone', '')

      if (data) {
        const dbNormalized = new Set(
          data.map((c: any) => normalizePhone(c.phone)).filter(Boolean)
        )
        for (const p of phones) {
          const norm = normalizePhone(p)
          if (norm && dbNormalized.has(norm)) existingPhones.push(norm)
        }
      }
    }

    // ── Capa 4: comparación por nombre de negocio (sin teléfono) ────────────
    if (names.length > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('name, company')

      if (data) {
        const dbNames = new Set(
          data.flatMap((c: any) => [
            c.name?.toLowerCase().trim(),
            c.company?.toLowerCase().trim(),
          ]).filter(Boolean)
        )
        for (const n of names) {
          const norm = n?.toLowerCase().trim()
          if (norm && dbNames.has(norm)) existingNames.push(norm)
        }
      }
    }

    // ── Capa 3: comparación por ID de INEGI (si la columna existe) ──────────
    if (inegi_ids.length > 0) {
      try {
        const { data } = await supabase
          .from('contacts')
          .select('inegi_id')
          .not('inegi_id', 'is', null)

        if (data) {
          const dbIds = new Set(data.map((c: any) => c.inegi_id).filter(Boolean))
          for (const id of inegi_ids) {
            if (id && dbIds.has(String(id))) existingInegiIds.push(String(id))
          }
        }
      } catch {
        // Columna inegi_id no existe aún — ignorar silenciosamente
      }
    }

    return NextResponse.json({ existingPhones, existingNames, existingInegiIds })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
