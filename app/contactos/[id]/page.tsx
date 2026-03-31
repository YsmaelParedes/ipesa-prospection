'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getContactById, updateContact, getContactFollowUps, getContactNotes, addContactNote, getSegments } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const TONE_BADGE: Record<string, any> = {
  confirmacion: 'info', validacion: 'warning', valor: 'success',
  empuje: 'danger', recordatorio: 'warning', cierre: 'danger',
}

const NOTE_BADGE: Record<string, any> = {
  objecion: 'danger', interes: 'success', info: 'info', accion: 'warning',
}

export default function EditContacto() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', address: '', segment: '', prospect_status: '', acquisition_channel: '' })
  const [segments, setSegments] = useState<any[]>([])
  const [followUps, setFollowUps] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('info')
  const [showNoteForm, setShowNoteForm] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [contact, fus, nts, segs] = await Promise.all([
          getContactById(id),
          getContactFollowUps(id),
          getContactNotes(id),
          getSegments(),
        ])
        setForm(contact)
        setFollowUps(fus)
        setNotes(nts)
        setSegments(segs)
      } catch {
        toast.error('Contacto no encontrado')
        router.push('/contactos')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, router])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateContact(id, form)
      toast.success('Contacto actualizado')
      router.push('/contactos')
    } catch (error: any) { toast.error(error.message) }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    try {
      await addContactNote(id, noteType, newNote)
      toast.success('Nota agregada')
      setNewNote('')
      setShowNoteForm(false)
      setNotes(await getContactNotes(id))
    } catch (error: any) { toast.error(error.message) }
  }

  if (loading) return (
    <>
      <Navbar />
      <div className="flex justify-center pt-20">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
      </div>
    </>
  )

  const pending = followUps.filter(f => f.status === 'pending')
  const completed = followUps.filter(f => f.status === 'completed')

  return (
    <>
      <Navbar />
      <div className="min-h-screen py-8 bg-gray-50 dark:bg-gray-900 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-4">

          <div className="flex items-center gap-3 mb-8">
            <Button variant="secondary" size="sm" onClick={() => router.push('/contactos')}>
              <ArrowLeft size={16} /> Volver
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{form.name}</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">{form.company} · {form.phone}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Columna izquierda: Formulario */}
            <div className="lg:col-span-1 space-y-6">
              <Card variant="elevated" className="p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Datos del Contacto</h2>
                <form onSubmit={handleSave} className="space-y-3">
                  <Input label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <Input label="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  <Input label="Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                  <Input label="Dirección" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  <Input label="Canal de adquisición" value={form.acquisition_channel} onChange={e => setForm({ ...form, acquisition_channel: e.target.value })} />
                  <Select label="Segmento" value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} options={[
                    { value: '', label: 'Sin segmento' },
                    ...segments.map(s => ({ value: s.name, label: s.name })),
                  ]} />
                  <Select label="Estado" value={form.prospect_status} onChange={e => setForm({ ...form, prospect_status: e.target.value })} options={[
                    { value: 'nuevo', label: 'Nuevo' },
                    { value: 'contactado', label: 'Contactado' },
                    { value: 'interesado', label: 'Interesado' },
                    { value: 'cliente', label: 'Cliente' },
                    { value: 'rechazado', label: 'Rechazado' },
                  ]} />
                  <Button type="submit" variant="primary" className="w-full">
                    <Save size={16} /> Guardar Cambios
                  </Button>
                </form>
              </Card>
            </div>

            {/* Columna derecha: Seguimiento + Notas */}
            <div className="lg:col-span-2 space-y-6">

              {/* Historial de seguimiento */}
              <Card variant="elevated" className="overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <h2 className="font-bold text-gray-900 dark:text-white">Historial de Seguimiento</h2>
                  <div className="flex gap-2">
                    <Badge variant="warning">{pending.length} pendientes</Badge>
                    <Badge variant="success">{completed.length} completados</Badge>
                  </div>
                </div>
                {followUps.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 dark:text-gray-500">
                    <p>Sin seguimientos asignados.</p>
                    <p className="text-sm mt-1">Ve a <strong>Seguimiento → Nuevo Plan</strong> para asignar una secuencia.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {followUps.map(fu => (
                      <div key={fu.id} className={`px-6 py-4 ${fu.status === 'completed' ? 'opacity-60' : ''}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900 dark:text-white text-sm">{fu.follow_up_stages?.stage_name}</span>
                              <Badge variant={TONE_BADGE[fu.follow_up_stages?.tone] || 'default'} className="text-xs">
                                {fu.follow_up_stages?.tone}
                              </Badge>
                              <Badge variant={fu.status === 'completed' ? 'success' : 'warning'} className="text-xs">
                                {fu.status === 'completed' ? '✓ Completo' : '⏳ Pendiente'}
                              </Badge>
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">{fu.follow_up_stages?.objective}</p>
                            {fu.notes && (
                              <p className="text-gray-600 dark:text-gray-400 text-xs mt-1 italic">"{fu.notes}"</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap ml-4">
                            Día {fu.follow_up_stages?.day} · {format(new Date(fu.scheduled_date), "d MMM", { locale: es })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Notas internas */}
              <Card variant="elevated" className="overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <h2 className="font-bold text-gray-900 dark:text-white">Notas Internas</h2>
                  <Button variant="outline" size="sm" onClick={() => setShowNoteForm(!showNoteForm)}>
                    <Plus size={15} /> Agregar
                  </Button>
                </div>

                {showNoteForm && (
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex gap-2 mb-2">
                      {['info', 'interes', 'objecion', 'accion'].map(t => (
                        <button
                          key={t}
                          onClick={() => setNoteType(t)}
                          className={`text-xs px-3 py-1 rounded-full font-semibold border transition ${noteType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      placeholder="Escribe la nota aquí..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 h-20 resize-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button variant="primary" size="sm" onClick={handleAddNote}>Guardar</Button>
                      <Button variant="secondary" size="sm" onClick={() => setShowNoteForm(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}

                {notes.length === 0 ? (
                  <p className="p-6 text-center text-gray-400 text-sm">Sin notas todavía</p>
                ) : (
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {notes.map(note => (
                      <div key={note.id} className="px-6 py-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <Badge variant={NOTE_BADGE[note.note_type] || 'default'} className="text-xs mb-1">{note.note_type}</Badge>
                            <p className="text-gray-800 dark:text-gray-200 text-sm">{note.content}</p>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 ml-4 whitespace-nowrap">
                            {format(new Date(note.created_at), "d MMM", { locale: es })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
