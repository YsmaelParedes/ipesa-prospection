import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { contacts } = await req.json()

    // Deduplicate by phone within the batch
    const seen = new Set<string>()
    const unique = contacts.filter((c: any) => {
      if (!c.phone || seen.has(c.phone)) return false
      seen.add(c.phone)
      return true
    })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('contacts')
      .upsert(unique, { onConflict: 'phone', ignoreDuplicates: true })
      .select()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al importar contactos' }, { status: 500 })
  }
}
