import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('[project-id]')) {
      throw new Error('Supabase credentials not configured. Update .env.local with your project URL and anon key.')
    }

    _supabase = createClient(supabaseUrl, supabaseKey)
  }
  return _supabase
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabase()[prop as keyof SupabaseClient]
  }
})

export async function getContacts() {
  const { data, error } = await getSupabase()
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function addContact(contact: any) {
  const { data, error } = await getSupabase()
    .from('contacts')
    .insert([contact])
    .select()

  if (error) throw error
  return data
}

export async function updateContact(id: string, updates: any) {
  const { data, error } = await getSupabase()
    .from('contacts')
    .update({ ...updates, updated_at: new Date() })
    .eq('id', id)
    .select()

  if (error) throw error
  return data
}

export async function deleteContact(id: string) {
  const { error } = await getSupabase()
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function importContacts(contacts: any[]) {
  // Deduplicate by phone within the batch
  const seen = new Set<string>()
  const unique = contacts.filter(c => {
    if (!c.phone || seen.has(c.phone)) return false
    seen.add(c.phone)
    return true
  })

  const { data, error } = await getSupabase()
    .from('contacts')
    .upsert(unique, { onConflict: 'phone', ignoreDuplicates: true })
    .select()

  if (error) throw error
  return data
}

export async function getTemplates() {
  const { data, error } = await getSupabase()
    .from('templates')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function addTemplate(template: any) {
  const { data, error } = await getSupabase()
    .from('templates')
    .insert([template])
    .select()

  if (error) throw error
  return data
}

export async function createReminder(reminder: any) {
  const { data, error } = await getSupabase()
    .from('reminders')
    .insert([reminder])
    .select()

  if (error) throw error
  return data
}

export async function getReminders() {
  const { data, error } = await getSupabase()
    .from('reminders')
    .select('*')
    .eq('is_completed', false)
    .lte('reminder_date', new Date().toISOString())
    .order('reminder_date', { ascending: true })

  if (error) throw error
  return data
}

export async function getContactById(id: string) {
  const { data, error } = await getSupabase()
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function completeReminder(id: string) {
  const { error } = await getSupabase()
    .from('reminders')
    .update({ is_completed: true })
    .eq('id', id)

  if (error) throw error
}

export async function getAllReminders() {
  const { data, error } = await getSupabase()
    .from('reminders')
    .select(`
      *,
      contacts(name, phone, company),
      campaigns(name)
    `)
    .order('reminder_date', { ascending: true })

  if (error) throw error
  return data
}

// Cuenta ítems urgentes: recordatorios + etapas de seguimiento vencidos hoy
export async function getAlertCount(): Promise<number> {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const cut = endOfToday.toISOString()
  const [r1, r2] = await Promise.all([
    getSupabase().from('reminders').select('id', { count: 'exact', head: true })
      .eq('is_completed', false).lte('reminder_date', cut),
    getSupabase().from('contact_follow_ups').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').lte('scheduled_date', cut),
  ])
  return (r1.count ?? 0) + (r2.count ?? 0)
}

// Etapas de seguimiento pendientes hasta N días adelante (para feed unificado)
export async function getFollowUpsDue(daysAhead = 1): Promise<any[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + daysAhead)
  cutoff.setHours(23, 59, 59, 999)
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .select(`*, contacts(name, phone, company), follow_up_stages(stage_name, objective, channel, tone, day)`)
    .eq('status', 'pending')
    .lte('scheduled_date', cutoff.toISOString())
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

// ===== FOLLOW-UP SYSTEM =====

export async function getFollowUpSequences() {
  const { data, error } = await getSupabase()
    .from('follow_up_sequences')
    .select('*')
    .eq('is_active', true)
  if (error) throw error
  return data
}

export async function getFollowUpStages(sequenceId: string) {
  const { data, error } = await getSupabase()
    .from('follow_up_stages')
    .select('*')
    .eq('sequence_id', sequenceId)
    .order('stage_number', { ascending: true })
  if (error) throw error
  return data
}

export async function createFollowUpPlan(contactId: string, sequenceId: string) {
  const stages = await getFollowUpStages(sequenceId)
  const followUps = stages.map((stage: any) => ({
    contact_id: contactId,
    sequence_id: sequenceId,
    stage_id: stage.id,
    scheduled_date: new Date(Date.now() + stage.day * 24 * 60 * 60 * 1000).toISOString(),
    status: 'pending',
    channel_used: stage.channel,
  }))
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .insert(followUps)
    .select()
  if (error) throw error
  return data
}

export async function getContactFollowUps(contactId: string) {
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .select(`*, follow_up_stages(stage_name, objective, day, tone, channel)`)
    .eq('contact_id', contactId)
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return data
}

export async function completeFollowUp(followUpId: string, responseStatus: string, notes?: string) {
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .update({ status: 'completed', completed_date: new Date().toISOString(), response_status: responseStatus, notes: notes || '', updated_at: new Date().toISOString() })
    .eq('id', followUpId)
    .select()
  if (error) throw error
  return data
}

export async function addContactNote(contactId: string, noteType: string, content: string) {
  const { data, error } = await getSupabase()
    .from('contact_notes')
    .insert([{ contact_id: contactId, note_type: noteType, content, created_by: 'admin' }])
    .select()
  if (error) throw error
  return data
}

export async function getContactNotes(contactId: string) {
  const { data, error } = await getSupabase()
    .from('contact_notes')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getFollowUpPendingActions() {
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .select(`*, contacts(name, phone, company), follow_up_stages(stage_name, objective, channel, tone)`)
    .eq('status', 'pending')
    .lte('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return data
}

export async function getAllFollowUpPlans() {
  const { data, error } = await getSupabase()
    .from('contact_follow_ups')
    .select(`
      *,
      contacts(id, name, phone, company),
      follow_up_stages(stage_name, objective, day, tone, channel)
    `)
    .order('scheduled_date', { ascending: true })
  if (error) throw error
  return data
}

export async function getPrimerContactoPendientes() {
  const { data, error } = await getSupabase()
    .from('contacts')
    .select('*')
    .eq('prospect_status', 'nuevo')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function markFirstContact(
  contactId: string,
  channel: string,
  response: string,
  notes: string,
  sequenceId?: string
) {
  const newStatus = response === 'cold' ? 'rechazado' : 'contactado'
  const { error: updateError } = await getSupabase()
    .from('contacts')
    .update({ prospect_status: newStatus, updated_at: new Date() })
    .eq('id', contactId)
  if (updateError) throw updateError

  if (notes) {
    await addContactNote(contactId, 'accion', `[Primer contacto vía ${channel}] ${notes}`)
  }

  if ((response === 'interested' || response === 'maybe') && sequenceId) {
    await createFollowUpPlan(contactId, sequenceId)
  }
}

export async function getSegments() {
  const { data, error } = await getSupabase()
    .from('segments')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function createSegment(segment: { name: string; description: string; color: string }) {
  const { data, error } = await getSupabase()
    .from('segments')
    .insert([segment])
    .select()
  if (error) throw error
  return data
}

export async function deleteSegment(id: string, name: string) {
  // Unassign contacts first
  await getSupabase()
    .from('contacts')
    .update({ segment: '' })
    .eq('segment', name.toLowerCase())
  const { error } = await getSupabase()
    .from('segments')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function deleteContacts(ids: string[]) {
  const { error } = await getSupabase()
    .from('contacts')
    .delete()
    .in('id', ids)
  if (error) throw error
}

export async function deleteFollowUpPlan(contactId: string, sequenceId: string) {
  const { error } = await getSupabase()
    .from('contact_follow_ups')
    .delete()
    .eq('contact_id', contactId)
    .eq('sequence_id', sequenceId)
  if (error) throw error
}

export async function getDashboardFollowUpStats() {
  const client = getSupabase()
  const [{ count: pendingActions }, { count: completedFollowUps }, { count: interestedLeads }, { count: convertedClients }] = await Promise.all([
    client.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    client.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    client.from('contact_follow_ups').select('*', { count: 'exact', head: true }).eq('response_status', 'interested'),
    client.from('contact_analytics').select('*', { count: 'exact', head: true }).eq('final_status', 'converted'),
  ])
  return {
    pendingActions: pendingActions || 0,
    completedFollowUps: completedFollowUps || 0,
    interestedLeads: interestedLeads || 0,
    convertedClients: convertedClients || 0,
  }
}

export async function getDashboardMetrics() {
  const client = getSupabase()

  const { count: totalContacts } = await client
    .from('contacts')
    .select('*', { count: 'exact', head: true })

  const { count: pendingReminders } = await client
    .from('reminders')
    .select('*', { count: 'exact', head: true })
    .eq('is_completed', false)

  const { data: campaignsData } = await client
    .from('campaigns')
    .select('sent_count, total_contacts')

  const totalSent = campaignsData?.reduce((sum: number, c: any) => sum + c.sent_count, 0) || 0

  return {
    totalContacts: totalContacts || 0,
    pendingReminders: pendingReminders || 0,
    totalMessagesSent: totalSent,
    conversionRate: totalContacts ? ((totalSent / totalContacts) * 100).toFixed(2) : 0
  }
}
