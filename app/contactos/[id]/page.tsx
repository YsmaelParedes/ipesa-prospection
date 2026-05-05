'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
// Data fetched from API routes (server-side Supabase)
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, Plus, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const NOTE_BADGE: Record<string, any> = {
  objecion: 'danger', interes: 'success', info: 'info', accion: 'warning',
}

export default function EditContacto() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', address: '', postal_code: '', segment: '', acquisition_channel: '' })
  const [segments, setSegments] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState('info')
  const [showNoteForm, setShowNoteForm] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [contact, nts, segs] = await Promise.all([
          fetch(`/api/data/contacts/${id}`).then(r => r.json()),
          fetch(`/api/data/contacts/${id}/notes`).then(r => r.json()),
          fetch('/api/data/segments').then(r => r.json()),
        ])
        if (contact.error) throw new Error(contact.error)
        setForm(contact)
        setNotes(nts || [])
        setSegments(segs.segments || [])
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
      const res = await fetch(`/api/data/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      toast.success('Contacto actualizado')
      router.push('/contactos')
    } catch (error: any) { toast.error(error.message) }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    try {
      const res = await fetch(`/api/data/contacts/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteType, content: newNote }),
      })
      if (!res.ok) throw new Error('Error al agregar nota')
      toast.success('Nota agregada')
      setNewNote('')
      setShowNoteForm(false)
      const notesRes = await fetch(`/api/data/contacts/${id}/notes`)
      const notesData = await notesRes.json()
      setNotes(notesData || [])
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

  return (
    <>
      <Navbar />
      <div className="min-h-screen py-4 sm:py-8 bg-gray-50 dark:bg-gray-900 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">

          <div className="flex items-center gap-3 mb-5 sm:mb-8 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => router.push('/contactos')}>
              <ArrowLeft size={16} /> Volver
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">{form.name}</h1>
              <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm truncate">{form.company} · {form.phone}</p>
            </div>
            <Link href={`/mensajeria?contacto=${form.phone}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex-shrink-0">
              <MessageCircle size={15} /> Enviar mensaje
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Columna izquierda: Formulario */}
            <div className="lg:col-span-1 space-y-6">
              <Card variant="elevated" className="p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Datos del Contacto</h2>
                <form onSubmit={handleSave} className="space-y-3">
                  <Input label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <Input
                    label="Teléfono"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    maxLength={10}
                    inputMode="numeric"
                    pattern="\d{10}"
                    placeholder="2221234567"
                    error={form.phone && form.phone.length < 10 ? `${form.phone.length}/10 dígitos` : undefined}
                    required
                  />
                  <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  <Input label="Empresa" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                  <Input label="Dirección" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  <Input label="Código Postal" value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} />
                  <Input label="Canal de adquisición" value={form.acquisition_channel} onChange={e => setForm({ ...form, acquisition_channel: e.target.value })} />
                  <Select label="Segmento" value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} options={[
                    { value: '', label: 'Sin segmento' },
                    ...segments.map(s => ({ value: s.name, label: s.name })),
                  ]} />
                  <Button type="submit" variant="primary" className="w-full">
                    <Save size={16} /> Guardar Cambios
                  </Button>
                </form>
              </Card>
            </div>

            {/* Columna derecha: Notas */}
            <div className="lg:col-span-2 space-y-6">

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
