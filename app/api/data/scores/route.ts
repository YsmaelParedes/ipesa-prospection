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

// POST /api/data/scores — guardar score (update si ya existe, solo si es mejor)
export async function POST(req: NextRequest) {
  try {
    const { player_name, score, game = 'snake' } = await req.json()
    if (!player_name || typeof score !== 'number') {
      return NextResponse.json({ error: 'player_name y score son requeridos' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const name = String(player_name).trim()
    const newScore = Math.max(0, score)

    // Buscar si el jugador ya tiene un score para este juego
    const { data: existing } = await supabase
      .from('game_scores')
      .select('id, score')
      .eq('player_name', name)
      .eq('game', game)
      .order('score', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Ya tiene score — actualizar solo si el nuevo es mejor
      if (newScore > existing.score) {
        const { data, error } = await supabase
          .from('game_scores')
          .update({ score: newScore })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) {
          console.error('[Scores POST update]', error)
          return NextResponse.json({ error: 'Error al actualizar score' }, { status: 500 })
        }
        return NextResponse.json({ score: data })
      }
      // Score nuevo no supera el récord — devolver el existente sin cambiar nada
      return NextResponse.json({ score: existing })
    }

    // Primer score del jugador — insertar
    const { data, error } = await supabase
      .from('game_scores')
      .insert({ player_name: name, score: newScore, game })
      .select()
      .single()

    if (error) {
      console.error('[Scores POST insert]', error)
      return NextResponse.json({ error: 'Error al guardar — verifica que la tabla game_scores exista' }, { status: 500 })
    }
    return NextResponse.json({ score: data })
  } catch (err: any) {
    console.error('[Scores POST]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
