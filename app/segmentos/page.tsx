'use client'

import { useEffect, useState } from 'react'
// Data fetched from API routes (server-side Supabase)
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

const STATUSES = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'rechazado', label: 'Rechazado' },
]

const statusPillClass: Record<string, string> = {
  nuevo:      'bg-blue-100 text-blue-700',
  contactado: 'bg-amber-100 text-amber-700',
  interesado: 'bg-green-100 text-green-700',
  cliente:    'bg-emerald-100 text-emerald-800',
  rechazado:  'bg-red-100 text-red-700',
}

export default function Segmentos() {
  const [segments, setSegments] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#0284c7' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '' })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [segs, cts] = await Promise.all([
        fetch('/api/data/segments').then(r => r.json()),
        fetch('/api/data/contacts').then(r => r.json()),
      ])
      setSegments(segs.segments || [])
      setContacts(cts.contacts || [])
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const countForSegment = (name: string) =>
    contacts.filter(c => c.segment?.toLowerCase() === name.toLowerCase()).length

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    try {
      const res = await fetch('/api/data/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Error al crear segmento')
      toast.success('Segmento creado')
      setForm({ name: '', description: '', color: '#0284c7' })
      setShowDrawer(false)
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
      const res = await fetch(`/api/data/segments/${seg.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: seg.name }),
      })
      if (!res.ok) throw new Error('Error al eliminar segmento')
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
      const res = await fetch(`/api/data/segments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) throw new Error('Error al actualizar segmento')
      toast.success('Segmento actualizado')
      setEditingId(null)
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
  }

  const totalContacts = contacts.length
  const withSegment = contacts.filter(c => c.segment).length
  const withoutSegment = totalContacts - withSegment
  const classificationRate = totalContacts > 0 ? Math.round((withSegment / totalContacts) * 100) : 0

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
            <Button variant="primary" onClick={() => setShowDrawer(true)}>
              <Plus size={18} /> Nuevo Segmento
            </Button>
          </div>

          {/* Stats — 4 cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{segments.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Segmentos activos</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{withSegment.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Clasificados</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className={`text-xl sm:text-2xl font-bold ${withoutSegment > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>{withoutSegment.toLocaleString()}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sin segmento</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm p-3 sm:p-4 text-center dark-mode-transition">
              <p className={`text-xl sm:text-2xl font-bold ${classificationRate >= 80 ? 'text-green-700 dark:text-green-400' : classificationRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>{classificationRate}%</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tasa de clasificación</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : segments.length === 0 ? (
            <Card className="p-16 text-center">
              <Tag size={64} className="text-gray-200 dark:text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-lg font-semibold mb-1">No hay segmentos creados</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-5">Los segmentos te permiten clasificar tus contactos<br className="hidden sm:inline" /> y analizar el avance de cada grupo</p>
              <button
                onClick={() => setShowDrawer(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                <Plus size={16} /> Crear primer segmento
              </button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {segments.map(seg => {
                const count = countForSegment(seg.name)
                const pct = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0
                const isEditing = editingId === seg.id

                const segContacts = contacts.filter(c => c.segment?.toLowerCase() === seg.name.toLowerCase())
                const statusBreakdown = STATUSES.map(s => ({
                  label: s.label,
                  count: segContacts.filter(c => c.prospect_status === s.value).length,
                  value: s.value,
                })).filter(s => s.count > 0)

                return (
                  <div
                    key={seg.id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden dark-mode-transition"
                    style={{ borderLeft: `4px solid ${seg.color}` }}
                  >
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
                          {/* Header row: name + actions */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                              <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{seg.name}</h3>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button onClick={() => startEdit(seg)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => handleDelete(seg)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Description */}
                          {seg.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{seg.description}</p>
                          )}

                          {/* Count + percentage */}
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <Users size={13} className="text-gray-400" />
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{count.toLocaleString()} contactos</span>
                            </div>
                            <span className="text-xs font-bold text-gray-400">{pct}%</span>
                          </div>

                          {/* Progress bar */}
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-3">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: seg.color }} />
                          </div>

                          {/* Status breakdown pills */}
                          {statusBreakdown.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {statusBreakdown.map(s => (
                                <span
                                  key={s.value}
                                  className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusPillClass[s.value] || 'bg-gray-100 text-gray-700'}`}
                                >
                                  {s.label} {s.count}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drawer: Nuevo Segmento */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDrawer(false)} />
          <div className="relative ml-auto w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

            {/* Header */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Tag size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg leading-tight">Nuevo Segmento</h2>
                    <p className="text-blue-200 text-xs">Crea una categoría para clasificar contactos</p>
                  </div>
                </div>
                <button onClick={() => setShowDrawer(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleAdd} className="flex-1 overflow-y-auto flex flex-col">
              <div className="px-6 py-5 space-y-5 flex-1">

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input
                    required
                    placeholder="ej: Pintor, Herrero, Mayorista"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
                  <input
                    placeholder="Breve descripción del segmento"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Color</label>
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
                  {/* Preview */}
                  <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                    style={{ borderLeft: `4px solid ${form.color}` }}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: form.color }} />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{form.name || 'Nombre del segmento'}</span>
                  </div>
                </div>

              </div>

              <div className="px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex gap-3 flex-shrink-0">
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
                  <Plus size={16} /> Crear segmento
                </button>
                <button type="button" onClick={() => setShowDrawer(false)} className="px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-semibold">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
