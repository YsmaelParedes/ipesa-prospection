import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  try {
    const { data, error } = await getClient()
      .from('sms_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ templates: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, content } = await req.json()
    if (!name?.trim())        return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    if (!content?.trim())     return NextResponse.json({ error: 'Contenido requerido' }, { status: 400 })
    if (content.length > 160) return NextResponse.json({ error: 'Máximo 160 caracteres por plantilla' }, { status: 400 })

    const { data, error } = await getClient()
      .from('sms_templates')
      .insert([{ name: name.trim(), content: content.trim() }])
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ template: data }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
