'use client'

import { useEffect, useState } from 'react'
// Data fetched from API routes (server-side Supabase)
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDistanceToNow, format, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Clock, CheckCircle, RefreshCw, MessageCircle, Phone, Mail, AlertCircle, CalendarClock } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'follow_up', label: 'Seguimiento' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'propuesta', label: 'Propuesta' },
  { value: 'otro', label: 'Otro' },
]

const CHANNEL_ICONS: Record<string, any> = {
  whatsapp: <MessageCircle size={14} className="text-green-500" />,
  call:      <Phone size={14} className="text-blue-500" />,
  email:     <Mail size={14} className="text-purple-500" />,
}

function urgencyLabel(dateStr: string) {
  const d = new Date(dateStr)
  if (isPast(d) && !isToday(d)) return { label: 'Vencido', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  if (isToday(d)) return { label: 'Hoy', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' }
  if (isTomorrow(d)) return { label: 'Mañana', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' }
  return { label: format(d, "d MMM", { locale: es }), color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' }
}

export default function Recordatorios() {
  const [reminders, setReminders] = useState<any[]>([])
  const [followUpsDue, setFollowUpsDue] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'todos' | 'manuales' | 'seguimiento'>('todos')
  const [form, setForm] = useState({ contact_id: '', reminder_date: '', reminder_type: 'follow_up', notes: '' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [r, c, fu] = await Promise.all([
        fetch('/api/data/reminders').then(r => r.json()),
        fetch('/api/data/contacts').then(r => r.json()),
        fetch('/api/data/follow-ups?type=due&days=1').then(r => r.json()),
      ])
      setReminders(r)
      setContacts(c)
      setFollowUpsDue(fu)
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const handleCompleteReminder = async (id: string) => {
    try {
      const res = await fetch(`/api/data/reminders/${id}`, { method: 'PUT' })
      if (!res.ok) throw new Error('Error al completar')
      toast.success('Recordatorio completado')
      fetchData()
    } catch (error: any) { toast.error(error.message) }
  }

  const handleCompleteFollowUp = async (id: string) => {
    try {
      const res = await fetch('/api/data/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', followUpId: id, responseStatus: 'interested', notes: '' }),
      })
      if (!res.ok) throw new Error('Error al completar')
      toast.success('Etapa de seguimiento completada')
      fetchData()
    } catch (error: any) { toast.error(error.message) }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_id || !form.reminder_date) { toast.error('Completa todos los campos'); return }
    try {
      const res = await fetch('/api/data/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, reminder_date: new Date(form.reminder_date).toISOString() }),
      })
      if (!res.ok) throw new Error('Error al crear recordatorio')
      toast.success('Recordatorio creado')
      setForm({ contact_id: '', reminder_date: '', reminder_type: 'follow_up', notes: '' })
      setShowForm(false)
      fetchData()
    } catch (error: any) { toast.error(error.message) }
  }

  const pendingReminders = reminders.filter(r => !r.is_completed)
  const completedReminders = reminders.filter(r => r.is_completed)

  // Feed unificado: recordatorios manuales pendientes + etapas de seguimiento vencidas/hoy
  const unifiedFeed = [
    ...pendingReminders.map(r => ({ ...r, _type: 'reminder' as const })),
    ...followUpsDue.map(f => ({ ...f, _type: 'followup' as const })),
  ].sort((a, b) => {
    const da = new Date(a._type === 'reminder' ? a.reminder_date : a.scheduled_date)
    const db = new Date(b._type === 'reminder' ? b.reminder_date : b.scheduled_date)
    return da.getTime() - db.getTime()
  })

  const vencidos = unifiedFeed.filter(i => {
    const d = new Date(i._type === 'reminder' ? i.reminder_date : i.scheduled_date)
    return isPast(d) && !isToday(d)
  })
  const hoyManana = unifiedFeed.filter(i => {
    const d = new Date(i._type === 'reminder' ? i.reminder_date : i.scheduled_date)
    return isToday(d) || isTomorrow(d)
  })

  const shownFeed = activeTab === 'manuales'
    ? unifiedFeed.filter(i => i._type === 'reminder')
    : activeTab === 'seguimiento'
    ? unifiedFeed.filter(i => i._type === 'followup')
    : unifiedFeed

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="flex flex-wrap gap-3 justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Recordatorios</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {vencidos.length > 0 && <span className="text-red-500 font-semibold">{vencidos.length} vencido{vencidos.length !== 1 ? 's' : ''} · </span>}
                {hoyManana.length} para hoy/mañana · {pendingReminders.length} manuales
              </p>
            </div>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={18} /> Nuevo recordatorio
            </Button>
          </div>

          {/* Stats rápidas */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-100 dark:border-red-800/30 text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{vencidos.length}</p>
              <p className="text-xs text-red-500 dark:text-red-400 font-semibold mt-0.5">Vencidos</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-100 dark:border-orange-800/30 text-center">
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{hoyManana.filter(i => isToday(new Date(i._type === 'reminder' ? i.reminder_date : i.scheduled_date))).length}</p>
              <p className="text-xs text-orange-500 dark:text-orange-400 font-semibold mt-0.5">Para hoy</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{unifiedFeed.length}</p>
              <p className="text-xs text-blue-500 dark:text-blue-400 font-semibold mt-0.5">Total pendientes</p>
            </div>
          </div>

          {/* Form nuevo recordatorio */}
          {showForm && (
            <Card variant="elevated" className="p-5 sm:p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nuevo Recordatorio Manual</h2>
              <form onSubmit={handleAdd}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Select
                    label="Contacto"
                    value={form.contact_id}
                    onChange={e => setForm({ ...form, contact_id: e.target.value })}
                    options={[
                      { value: '', label: 'Seleccionar...' },
                      ...contacts.map(c => ({ value: c.id, label: `${c.name} (${c.phone})` })),
                    ]}
                  />
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Fecha y hora</label>
                    <input
                      type="datetime-local"
                      value={form.reminder_date}
                      onChange={e => setForm({ ...form, reminder_date: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark-mode-transition"
                      required
                    />
                  </div>
                  <Select label="Tipo" value={form.reminder_type} onChange={e => setForm({ ...form, reminder_type: e.target.value })} options={TYPE_OPTIONS} />
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notas (opcional)</label>
                    <input
                      placeholder="¿Qué tienes que hacer?"
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark-mode-transition"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Crear</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </form>
            </Card>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : (
            <div className="space-y-6">

              {/* Feed pendientes */}
              <Card variant="elevated" className="overflow-hidden">
                {/* Header + tabs */}
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={18} className="text-orange-500" />
                      <h2 className="font-bold text-gray-900 dark:text-white">Pendientes</h2>
                      <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">{shownFeed.length}</span>
                    </div>
                  </div>
                  {/* Sub-tabs */}
                  <div className="flex gap-1">
                    {([
                      { key: 'todos', label: `Todos (${unifiedFeed.length})` },
                      { key: 'manuales', label: `Manuales (${pendingReminders.length})` },
                      { key: 'seguimiento', label: `Seguimiento (${followUpsDue.length})` },
                    ] as const).map(t => (
                      <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {shownFeed.length === 0 ? (
                  <p className="p-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    {activeTab === 'todos' ? 'No hay pendientes — ¡todo al día!' : 'Nada en esta categoría'}
                  </p>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {shownFeed.map((item) => {
                      if (item._type === 'reminder') {
                        const urg = urgencyLabel(item.reminder_date)
                        return (
                          <div key={`r-${item.id}`} className="px-5 py-4 flex items-start gap-4">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <Clock size={16} className="text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-gray-900 dark:text-white text-sm">{item.contacts?.name}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urg.color}`}>{urg.label}</span>
                                <Badge variant="warning" className="text-xs">{item.reminder_type}</Badge>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{item.contacts?.phone} · {item.contacts?.company}</p>
                              {item.notes && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">"{item.notes}"</p>}
                              <p className="text-xs text-gray-400 mt-1">
                                {formatDistanceToNow(new Date(item.reminder_date), { locale: es, addSuffix: true })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Link href={`/contactos/${item.contact_id}`} className="text-xs text-blue-500 hover:underline hidden sm:block">Ver contacto</Link>
                              <Button variant="success" size="sm" onClick={() => handleCompleteReminder(item.id)}>
                                <CheckCircle size={14} /> Completar
                              </Button>
                            </div>
                          </div>
                        )
                      } else {
                        // Follow-up stage
                        const urg = urgencyLabel(item.scheduled_date)
                        const ch = item.follow_up_stages?.channel
                        return (
                          <div key={`f-${item.id}`} className="px-5 py-4 flex items-start gap-4">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <RefreshCw size={16} className="text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-gray-900 dark:text-white text-sm">{item.contacts?.name}</span>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${urg.color}`}>{urg.label}</span>
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                                  {ch && CHANNEL_ICONS[ch]}
                                  {item.follow_up_stages?.stage_name || 'Seguimiento'}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{item.contacts?.phone} · {item.contacts?.company}</p>
                              {item.follow_up_stages?.objective && (
                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{item.follow_up_stages.objective}</p>
                              )}
                              <p className="text-xs text-gray-400 mt-1">
                                {formatDistanceToNow(new Date(item.scheduled_date), { locale: es, addSuffix: true })}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Link href={`/contactos/${item.contact_id}`} className="text-xs text-blue-500 hover:underline hidden sm:block">Ver contacto</Link>
                              <Link href="/seguimiento" className="text-xs text-gray-400 hover:text-blue-500 hidden sm:block">Ir a seguimiento →</Link>
                              <Button variant="success" size="sm" onClick={() => handleCompleteFollowUp(item.id)}>
                                <CheckCircle size={14} /> Completar
                              </Button>
                            </div>
                          </div>
                        )
                      }
                    })}
                  </div>
                )}
              </Card>

              {/* Completados (solo manuales) */}
              {completedReminders.length > 0 && (
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-500" />
                    <h2 className="font-bold text-gray-900 dark:text-white">Completados</h2>
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2 py-0.5 rounded-full">{completedReminders.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {completedReminders.slice(0, 20).map(r => (
                      <div key={r.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
                        <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{r.contacts?.name}</span>
                        <span className="text-xs text-gray-400">{r.contacts?.phone}</span>
                        <Badge variant="default" className="text-xs ml-auto">{r.reminder_type}</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
