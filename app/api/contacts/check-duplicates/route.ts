import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'
import { verifySession } from '@/lib/auth'

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
    // Auth check
    if (!verifySession(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { phones = [], names = [], inegi_ids = [] } = await req.json()

    const supabase = getServerSupabase()

    const existingPhones: string[] = []
    const existingNames: string[] = []
    const existingInegiIds: string[] = []

    // Layer 1: phone comparison (normalized)
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

    // Layer 2: business name comparison
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

    // Layer 3: INEGI ID comparison
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
        // Column inegi_id may not exist yet
      }
    }

    return NextResponse.json({ existingPhones, existingNames, existingInegiIds })
  } catch (error: any) {
    console.error('Check duplicates error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
