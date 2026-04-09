import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const type = searchParams.get('type')
    const supabase = getServerSupabase()

    if (type === 'stats') {
      const [{ count: pendingActions }, { count: completedFollowUps }, { count: interestedLeads }, { count: convertedClients }] = await Promise.all([
        supabase.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('response_status', 'interested'),
        supabase.from('contact_analytics').select('*', { count: 'exact', head: true }).eq('final_status', 'converted'),
      ])
      return NextResponse.json({
        pendingActions: pendingActions || 0,
        completedFollowUps: completedFollowUps || 0,
        interestedLeads: interestedLeads || 0,
        convertedClients: convertedClients || 0,
      })
    }

    if (type === 'pending') {
      const { data, error } = await supabase
        .from('contact_follow_ups')
        .select('*, contacts(name, phone, company), follow_up_stages(stage_name, objective, channel, tone)')
        .eq('status', 'pending')
        .lte('scheduled_date', new Date().toISOString())
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      return NextResponse.json({ actions: data })
    }

    if (type === 'plans') {
      const { data, error } = await supabase
        .from('contact_follow_ups')
        .select('*, contacts(id, name, phone, company), follow_up_stages(stage_name, objective, day, tone, channel)')
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      return NextResponse.json({ plans: data })
    }

    if (type === 'sequences') {
      const { data, error } = await supabase
        .from('follow_up_sequences')
        .select('*')
        .eq('is_active', true)
      if (error) throw error
      return NextResponse.json({ sequences: data })
    }

    if (type === 'primer-contacto') {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('prospect_status', 'nuevo')
        .order('created_at', { ascending: false })
      if (error) throw error
      return NextResponse.json({ contacts: data })
    }

    if (type === 'due') {
      const days = parseInt(searchParams.get('days') || '1')
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() + days)
      cutoff.setHours(23, 59, 59, 999)
      const { data, error } = await supabase
        .from('contact_follow_ups')
        .select('*, contacts(name, phone, company), follow_up_stages(stage_name, objective, channel, tone, day)')
        .eq('status', 'pending')
        .lte('scheduled_date', cutoff.toISOString())
        .order('scheduled_date', { ascending: true })
      if (error) throw error
      return NextResponse.json({ followUps: data })
    }

    return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error al obtener datos de seguimiento' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = getServerSupabase()

    if (body.action === 'complete') {
      const { followUpId, responseStatus, notes } = body
      const { data, error } = await supabase
        .from('contact_follow_ups')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString(),
          response_status: responseStatus,
          notes: notes || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', followUpId)
        .select()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (body.action === 'create-plan') {
      const { contactId, sequenceId } = body

      // Get stages for the sequence
      const { data: stages, error: stagesError } = await supabase
        .from('follow_up_stages')
        .select('*')
        .eq('sequence_id', sequenceId)
        .order('stage_number', { ascending: true })
      if (stagesError) throw stagesError

      const followUps = (stages || []).map((stage: any) => ({
        contact_id: contactId,
        sequence_id: sequenceId,
        stage_id: stage.id,
        scheduled_date: new Date(Date.now() + stage.day * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        channel_used: stage.channel,
      }))

      const { data, error } = await supabase
        .from('contact_follow_ups')
        .insert(followUps)
        .select()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (body.action === 'note') {
      const { contactId, noteType, content } = body
      const { data, error } = await supabase
        .from('contact_notes')
        .insert([{ contact_id: contactId, note_type: noteType, content, created_by: 'admin' }])
        .select()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (body.action === 'mark-first') {
      const { contactId, channel, response, notes, sequenceId } = body
      const newStatus = response === 'cold' ? 'rechazado' : 'contactado'

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ prospect_status: newStatus, updated_at: new Date() })
        .eq('id', contactId)
      if (updateError) throw updateError

      if (notes) {
        await supabase
          .from('contact_notes')
          .insert([{ contact_id: contactId, note_type: 'accion', content: `[Primer contacto vía ${channel}] ${notes}`, created_by: 'admin' }])
      }

      if ((response === 'interested' || response === 'maybe') && sequenceId) {
        // Create follow-up plan
        const { data: stages } = await supabase
          .from('follow_up_stages')
          .select('*')
          .eq('sequence_id', sequenceId)
          .order('stage_number', { ascending: true })

        if (stages && stages.length > 0) {
          const followUps = stages.map((stage: any) => ({
            contact_id: contactId,
            sequence_id: sequenceId,
            stage_id: stage.id,
            scheduled_date: new Date(Date.now() + stage.day * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            channel_used: stage.channel,
          }))
          await supabase.from('contact_follow_ups').insert(followUps)
        }
      }

      return NextResponse.json({ success: true })
    }

    if (body.action === 'delete-plan') {
      const { contactId, sequenceId } = body
      const { error } = await supabase
        .from('contact_follow_ups')
        .delete()
        .eq('contact_id', contactId)
        .eq('sequence_id', sequenceId)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error en operación de seguimiento' }, { status: 500 })
  }
}
