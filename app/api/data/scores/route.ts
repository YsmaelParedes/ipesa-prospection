import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

// GET /api/data/scores?game=snake — top 10 del juego
export async function GET(req: NextRequest) {
  try {
    const game = req.nextUrl.searchParams.get('game') ?? 'snake'
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('game_scores')
      .select('id, player_name, score, created_at')
      .eq('game', game)
      .order('score', { ascending: false })
      .limit(10)

    if (error) {
      // Tabla no existe aún — responder con lista vacía
      console.warn('[Scores GET]', error.message)
      return NextResponse.json({ scores: [] })
    }
    return NextResponse.json({ scores: data ?? [] })
  } catch (err: any) {
    console.error('[Scores GET]', err)
    return NextResponse.json({ scores: [] })
  }
}

// POST /api/data/scores — guardar un nuevo score
export async function POST(req: NextRequest) {
  try {
    const { player_name, score, game = 'snake' } = await req.json()
    if (!player_name || typeof score !== 'number') {
      return NextResponse.json({ error: 'player_name y score son requeridos' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('game_scores')
      .insert({ player_name: String(player_name).trim(), score: Math.max(0, score), game })
      .select()
      .single()

    if (error) {
      console.error('[Scores POST]', error)
      return NextResponse.json({ error: 'Error al guardar — verifica que la tabla game_scores exista' }, { status: 500 })
    }
    return NextResponse.json({ score: data })
  } catch (err: any) {
    console.error('[Scores POST]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
