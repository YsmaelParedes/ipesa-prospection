'use client'

import { useEffect, useState } from 'react'
import { getAllReminders, completeReminder, getContacts, createReminder } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, Clock, CheckCircle } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: 'follow_up', label: 'Seguimiento' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'propuesta', label: 'Propuesta' },
  { value: 'otro', label: 'Otro' },
]

export default function Recordatorios() {
  const [reminders, setReminders] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ contact_id: '', reminder_date: '', reminder_type: 'follow_up' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [r, c] = await Promise.all([getAllReminders(), getContacts()])
      setReminders(r)
      setContacts(c)
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const handleComplete = async (id: string) => {
    try {
      await completeReminder(id)
      toast.success('Completado')
      fetchData()
    } catch (error: any) { toast.error(error.message) }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.contact_id || !form.reminder_date) { toast.error('Completa todos los campos'); return }
    try {
      await createReminder({ ...form, reminder_date: new Date(form.reminder_date).toISOString() })
      toast.success('Recordatorio creado')
      setForm({ contact_id: '', reminder_date: '', reminder_type: 'follow_up' })
      setShowForm(false)
      fetchData()
    } catch (error: any) { toast.error(error.message) }
  }

  const pending = reminders.filter(r => !r.is_completed)
  const completed = reminders.filter(r => r.is_completed)

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">
          <div className="flex flex-wrap gap-3 justify-between items-start mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Recordatorios</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Seguimiento de prospectos y clientes</p>
            </div>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={18} /> Nuevo
            </Button>
          </div>

          {showForm && (
            <Card variant="elevated" className="p-5 sm:p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Nuevo Recordatorio</h2>
              <form onSubmit={handleAdd}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                      className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark-mode-transition"
                      required
                    />
                  </div>
                  <Select label="Tipo" value={form.reminder_type} onChange={e => setForm({ ...form, reminder_type: e.target.value })} options={TYPE_OPTIONS} />
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
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600" />
            </div>
          ) : (
            <div className="space-y-6">
              <Card variant="elevated" className="overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-danger-50 dark:bg-danger-900/20 border-b border-danger-100 dark:border-danger-800/50 flex items-center gap-2">
                  <Clock size={20} className="text-danger-600 dark:text-danger-400" />
                  <h2 className="text-lg font-bold text-danger-700 dark:text-danger-300">Pendientes ({pending.length})</h2>
                </div>
                {pending.length === 0 ? (
                  <p className="p-8 text-center text-gray-400 dark:text-gray-500">No hay recordatorios pendientes</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                        <tr>
                          {['Contacto', 'Teléfono', 'Empresa', 'Tiempo', 'Tipo', 'Acción'].map(h => (
                            <th key={h} className="px-4 sm:px-5 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {pending.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 dark-mode-transition">
                            <td className="px-4 sm:px-5 py-3 font-medium text-gray-900 dark:text-white">{r.contacts?.name}</td>
                            <td className="px-4 sm:px-5 py-3 font-mono text-sm text-gray-600 dark:text-gray-300">{r.contacts?.phone}</td>
                            <td className="px-4 sm:px-5 py-3 text-gray-600 dark:text-gray-300">{r.contacts?.company}</td>
                            <td className="px-4 sm:px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                              {formatDistanceToNow(new Date(r.reminder_date), { locale: es, addSuffix: true })}
                            </td>
                            <td className="px-4 sm:px-5 py-3"><Badge variant="warning">{r.reminder_type}</Badge></td>
                            <td className="px-4 sm:px-5 py-3">
                              <Button variant="success" size="sm" onClick={() => handleComplete(r.id)}>
                                <CheckCircle size={15} /> Completar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {completed.length > 0 && (
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-4 sm:px-6 py-4 bg-success-50 dark:bg-success-900/20 border-b border-success-100 dark:border-success-800/50 flex items-center gap-2">
                    <CheckCircle size={20} className="text-success-600 dark:text-success-400" />
                    <h2 className="text-lg font-bold text-success-700 dark:text-success-300">Completados ({completed.length})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                        <tr>
                          {['Contacto', 'Teléfono', 'Empresa', 'Tipo'].map(h => (
                            <th key={h} className="px-4 sm:px-5 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {completed.map(r => (
                          <tr key={r.id} className="bg-gray-50 dark:bg-gray-800/30 opacity-70">
                            <td className="px-4 sm:px-5 py-3 text-gray-600 dark:text-gray-400">{r.contacts?.name}</td>
                            <td className="px-4 sm:px-5 py-3 font-mono text-sm text-gray-500 dark:text-gray-500">{r.contacts?.phone}</td>
                            <td className="px-4 sm:px-5 py-3 text-gray-500 dark:text-gray-500">{r.contacts?.company}</td>
                            <td className="px-4 sm:px-5 py-3"><Badge variant="default">{r.reminder_type}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
