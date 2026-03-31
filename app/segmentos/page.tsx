'use client'

import { useEffect, useState } from 'react'
import { getSegments, createSegment, deleteSegment, getContacts } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { Plus, Tag, Trash2, Users, Edit2, Check, X } from 'lucide-react'

const PRESET_COLORS = [
  '#0284c7','#16a34a','#dc2626','#d97706','#7c3aed',
  '#db2777','#0891b2','#65a30d','#ea580c','#6b7280',
]

export default function Segmentos() {
  const [segments, setSegments] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#0284c7' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '' })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [segs, cts] = await Promise.all([getSegments(), getContacts()])
      setSegments(segs)
      setContacts(cts)
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const countForSegment = (name: string) =>
    contacts.filter(c => c.segment?.toLowerCase() === name.toLowerCase()).length

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    try {
      await createSegment(form)
      toast.success('Segmento creado')
      setForm({ name: '', description: '', color: '#0284c7' })
      setShowForm(false)
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
  }

  const handleDelete = async (seg: any) => {
    const count = countForSegment(seg.name)
    const msg = count > 0
      ? `¿Eliminar "${seg.name}"? Los ${count} contactos quedarán sin segmento.`
      : `¿Eliminar el segmento "${seg.name}"?`
    if (!confirm(msg)) return
    try {
      await deleteSegment(seg.id, seg.name)
      toast.success(`Segmento "${seg.name}" eliminado`)
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
  }

  const startEdit = (seg: any) => {
    setEditingId(seg.id)
    setEditForm({ name: seg.name, description: seg.description || '', color: seg.color })
  }

  const handleEditSave = async (id: string) => {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error } = await (supabase as any).from('segments').update(editForm).eq('id', id)
      if (error) throw error
      toast.success('Segmento actualizado')
      setEditingId(null)
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
  }

  const totalContacts = contacts.length
  const withSegment = contacts.filter(c => c.segment).length
  const withoutSegment = totalContacts - withSegment

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">

          <div className="flex flex-wrap gap-3 justify-between items-start mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Segmentos</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Clasifica tus contactos por categoría de negocio</p>
            </div>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={18} /> Nuevo Segmento
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{segments.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Segmentos activos</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{withSegment.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Clasificados</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className="text-xl sm:text-2xl font-bold" style={{ color: withoutSegment > 0 ? '#d97706' : '#15803d' }}>{withoutSegment.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sin segmento</p>
            </div>
          </div>

          {/* New segment form */}
          {showForm && (
            <Card variant="elevated" className="p-5 sm:p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nuevo Segmento</h2>
              <form onSubmit={handleAdd}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input label="Nombre *" placeholder="ej: Pintor, Herrero, Mayorista" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <Input label="Descripción" placeholder="Breve descripción del segmento" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Color</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c} type="button"
                        onClick={() => setForm({ ...form, color: c })}
                        className="w-8 h-8 rounded-full border-2 transition"
                        style={{ backgroundColor: c, borderColor: form.color === c ? '#1e293b' : 'transparent', transform: form.color === c ? 'scale(1.2)' : 'scale(1)' }}
                      />
                    ))}
                    <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                      className="w-8 h-8 rounded-full border border-gray-300 cursor-pointer p-0.5" title="Color personalizado" />
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
          ) : segments.length === 0 ? (
            <Card className="p-16 text-center">
              <Tag size={48} className="text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 dark:text-gray-500 text-lg">No hay segmentos creados</p>
              <p className="text-gray-300 dark:text-gray-600 text-sm mt-1">Crea el primero para empezar a clasificar tus contactos</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {segments.map(seg => {
                const count = countForSegment(seg.name)
                const pct = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0
                const isEditing = editingId === seg.id

                return (
                  <Card key={seg.id} variant="elevated" className="overflow-hidden">
                    <div className="h-1.5 w-full" style={{ backgroundColor: seg.color }} />
                    <div className="p-5">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={editForm.name}
                              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold dark-mode-transition"
                              placeholder="Nombre"
                            />
                            <input
                              value={editForm.description}
                              onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                              placeholder="Descripción"
                            />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {PRESET_COLORS.map(c => (
                              <button key={c} type="button" onClick={() => setEditForm({ ...editForm, color: c })}
                                className="w-6 h-6 rounded-full border-2 transition"
                                style={{ backgroundColor: c, borderColor: editForm.color === c ? '#1e293b' : 'transparent' }} />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="primary" size="sm" onClick={() => handleEditSave(seg.id)}><Check size={14} /> Guardar</Button>
                            <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}><X size={14} /> Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                              <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">{seg.name}</h3>
                                {seg.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{seg.description}</p>}
                              </div>
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => startEdit(seg)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => handleDelete(seg)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            <Users size={14} className="text-gray-400" />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{count.toLocaleString()} contactos</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">({pct}%)</span>
                          </div>

                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: seg.color }} />
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
