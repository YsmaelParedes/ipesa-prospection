'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
// Data fetched from API routes (server-side Supabase)
import { useTheme } from '@/components/ThemeProvider'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Plus, Upload, Trash2, Edit, Search, FileSpreadsheet, X, CheckSquare, Square, Filter, ChevronDown, ChevronUp, Download, TableProperties, MessageCircle } from 'lucide-react'

function isValidPhone(phone: string): boolean {
  return /^\d{10}$/.test(phone)
}

const STATUSES = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'rechazado', label: 'Rechazado' },
]

const ACQUISITION_CHANNELS = [
  { value: '', label: 'Seleccionar canal...' },
  { value: 'Scraper INEGI', label: 'Scraper INEGI' },
  { value: 'Google Maps', label: 'Google Maps' },
  { value: 'Referido', label: 'Referido' },
  { value: 'Visita directa', label: 'Visita directa' },
  { value: 'Llamada en frío', label: 'Llamada en frío' },
  { value: 'Redes sociales', label: 'Redes sociales' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Email', label: 'Email' },
  { value: 'Feria / Evento', label: 'Feria / Evento' },
  { value: 'Otro', label: 'Otro' },
]
const statusBadge: Record<string, any> = {
  nuevo: 'info', contactado: 'warning', interesado: 'success', cliente: 'success', rechazado: 'danger',
}
const statusLabel: Record<string, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', interesado: 'Interesado', cliente: 'Cliente', rechazado: 'Rechazado',
}

const EMPTY_FORM = { name: '', phone: '', email: '', company: '', address: '', postal_code: '', segment: '', prospect_status: 'nuevo', acquisition_channel: '' }

interface DrawerProps {
  open: boolean
  onClose: () => void
  onSave: (data: typeof EMPTY_FORM) => void
  segments: string[]
  defaultSegment: string
}

function NuevoContactoDrawer({ open, onClose, onSave, segments, defaultSegment }: DrawerProps) {
  const [form, setForm] = useState({ ...EMPTY_FORM, segment: defaultSegment })

  useEffect(() => {
    if (open) setForm({ ...EMPTY_FORM, segment: defaultSegment })
  }, [open, defaultSegment])

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) { toast.error('El nombre es requerido'); return }
    if (!form.phone) { toast.error('El teléfono es requerido'); return }
    if (!isValidPhone(form.phone)) { toast.error('El teléfono debe tener exactamente 10 dígitos'); return }
    onSave(form)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-md h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Plus size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">Nuevo Contacto</h2>
                <p className="text-blue-200 text-xs">Completa la información del prospecto</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {form.name ? form.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{form.name || 'Nombre del contacto'}</p>
              <p className="text-blue-200 text-xs truncate">{form.company || form.phone || 'Empresa o teléfono'}</p>
            </div>
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-6 py-5 space-y-5 flex-1">

            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Datos principales</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input required placeholder="Juan Pérez" value={form.name} onChange={e => set('name', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Teléfono <span className="text-red-500">*</span></label>
                  <input required placeholder="2221234567" value={form.phone}
                    onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10} inputMode="numeric" pattern="\d{10}"
                    className={`w-full px-3 py-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500 ${form.phone && !isValidPhone(form.phone) ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-700'}`} />
                  {form.phone && !isValidPhone(form.phone) && <p className="text-xs text-red-500 mt-1">{form.phone.length}/10 dígitos</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
                    <input type="email" placeholder="juan@empresa.com" value={form.email} onChange={e => set('email', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Empresa</label>
                    <input placeholder="Acme Corp" value={form.company} onChange={e => set('company', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Ubicación</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Dirección</label>
                  <input placeholder="Calle 123, Colonia" value={form.address} onChange={e => set('address', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">C.P.</label>
                  <input placeholder="72000" value={form.postal_code} onChange={e => set('postal_code', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Clasificación</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Canal de adquisición</label>
                  <select value={form.acquisition_channel} onChange={e => set('acquisition_channel', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    {ACQUISITION_CHANNELS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Segmento</label>
                    <select value={form.segment} onChange={e => set('segment', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      <option value="">Sin segmento</option>
                      {segments.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                    <select value={form.prospect_status} onChange={e => set('prospect_status', e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                      {STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex gap-3 flex-shrink-0">
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2">
              <Plus size={16} /> Guardar contacto
            </button>
            <button type="button" onClick={onClose} className="px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Contactos() {
  const [contacts, setContacts] = useState<any[]>([])
  const [segments, setSegments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('__todos__')
  const [showForm, setShowForm] = useState(false)

  // Search & filters within tab
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Sorting
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSegment, setBulkSegment] = useState('')
  const [bulkChannel, setBulkChannel] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Exportar Excel
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Excel import
  const [xlsxModal, setXlsxModal] = useState(false)
  const [xlsxSheets, setXlsxSheets] = useState<{ name: string; rows: any[]; selected: boolean }[]>([])
  const [xlsxImporting, setXlsxImporting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [cts, segs] = await Promise.all([
        fetch('/api/data/contacts').then(r => r.json()),
        fetch('/api/data/segments').then(r => r.json()),
      ])
      setContacts(cts)
      setSegments(segs)
    } catch { toast.error('Error al cargar contactos') }
    finally { setLoading(false) }
  }

  const fetchContacts = fetchAll

  // Tabs: driven by segments table + "Sin segmento" if needed
  const tabs = useMemo(() => {
    const countMap: Record<string, number> = {}
    contacts.forEach(c => { const k = c.segment?.toLowerCase() || '__sin__'; countMap[k] = (countMap[k] || 0) + 1 })
    const segTabs = segments.map(s => ({
      key: s.name.toLowerCase(),
      label: s.name,
      color: s.color,
      count: countMap[s.name.toLowerCase()] || 0,
    }))
    const sinSeg = countMap['__sin__'] || 0
    return [
      { key: '__todos__', label: 'Todos', color: '#0369a1', count: contacts.length },
      ...segTabs,
      ...(sinSeg > 0 ? [{ key: '__sin_segmento__', label: 'Sin segmento', color: '#9ca3af', count: sinSeg }] : []),
    ]
  }, [contacts, segments])

  // All unique segments for dropdowns
  const allSegments = useMemo(() => segments.map(s => s.name), [segments])

  const channelOptions = useMemo(() => {
    const vals = [...new Set(contacts.map(c => c.acquisition_channel).filter(Boolean))].sort()
    return [{ value: '', label: 'Todos los canales' }, ...vals.map(v => ({ value: v, label: v }))]
  }, [contacts])

  // Contacts for active tab + search/filters + sort
  const tabContacts = useMemo(() => {
    let list = contacts
    if (activeTab === '__sin_segmento__') list = contacts.filter(c => !c.segment)
    else if (activeTab !== '__todos__') list = contacts.filter(c => c.segment?.toLowerCase() === activeTab)

    return list.filter(c => {
      if (search) {
        const q = search.toLowerCase()
        if (!(c.name?.toLowerCase().includes(q) || c.phone?.includes(q) ||
          c.company?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))) return false
      }
      if (filterStatus && c.prospect_status !== filterStatus) return false
      if (filterChannel && c.acquisition_channel !== filterChannel) return false
      return true
    }).sort((a, b) => {
      const va = a[sortBy] ?? ''
      const vb = b[sortBy] ?? ''
      const cmp = String(va).localeCompare(String(vb), 'es', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [contacts, activeTab, search, filterStatus, filterChannel, sortBy, sortDir])

  const handleAdd = (data: typeof EMPTY_FORM) => {
    const segment = data.segment || (activeTab !== '__todos__' && activeTab !== '__sin_segmento__' ? activeTab : '')
    const tempId = `temp_${Date.now()}`
    const optimistic = { ...data, segment, id: tempId, created_at: new Date().toISOString() }
    setContacts(prev => [optimistic, ...prev])
    setShowForm(false)
    toast.success('Contacto agregado')
    fetch('/api/data/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, segment }),
    }).then(r => r.json()).then((result) => {
      if (Array.isArray(result) && result[0]) {
        setContacts(prev => prev.map(c => c.id === tempId ? result[0] : c))
      }
    }).catch((err: any) => {
      setContacts(prev => prev.filter(c => c.id !== tempId))
      toast.error(err.message || 'Error al agregar')
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar contacto?')) return
    try {
      const res = await fetch(`/api/data/contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setContacts(prev => prev.filter(c => c.id !== id))
      toast.success('Eliminado')
    } catch { toast.error('Error al eliminar') }
  }

  const handleStatusChange = async (id: string, newStatus: string) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, prospect_status: newStatus } : c))
    try {
      const res = await fetch(`/api/data/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_status: newStatus }),
      })
      if (!res.ok) throw new Error()
    } catch {
      const original = contacts.find(x => x.id === id)?.prospect_status
      setContacts(prev => prev.map(c => c.id === id ? { ...c, prospect_status: original } : c))
      toast.error('Error al cambiar estado')
    }
  }

  const lastSelectedIdx = useRef<number>(-1)

  const toggleSelect = (id: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIdx.current !== -1) {
      // Shift+click: seleccionar rango entre último y actual
      const start = Math.min(lastSelectedIdx.current, index)
      const end = Math.max(lastSelectedIdx.current, index)
      setSelected(prev => {
        const next = new Set(prev)
        for (let i = start; i <= end; i++) next.add(tabContacts[i].id)
        return next
      })
    } else {
      // Click normal o Ctrl: toggle individual
      setSelected(prev => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }
    lastSelectedIdx.current = index
  }

  const toggleSelectAll = () => {
    lastSelectedIdx.current = -1
    setSelected(selected.size === tabContacts.length && tabContacts.length > 0
      ? new Set() : new Set(tabContacts.map(c => c.id)))
  }

  const handleBulkSegment = async () => {
    if (!bulkSegment) { toast.error('Selecciona un segmento'); return }
    if (selected.size === 0) return
    try {
      setBulkSaving(true)
      await Promise.all([...selected].map(id =>
        fetch(`/api/data/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment: bulkSegment }),
        })
      ))
      setContacts(prev => prev.map(c => selected.has(c.id) ? { ...c, segment: bulkSegment } : c))
      toast.success(`${selected.size} contactos → "${bulkSegment}"`)
      setSelected(new Set()); setBulkSegment('')
    } catch (error: any) { toast.error(error.message) }
    finally { setBulkSaving(false) }
  }

  const handleBulkChannel = async () => {
    if (!bulkChannel) { toast.error('Selecciona un canal de adquisición'); return }
    if (selected.size === 0) return
    try {
      setBulkSaving(true)
      await Promise.all([...selected].map(id =>
        fetch(`/api/data/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acquisition_channel: bulkChannel }),
        })
      ))
      setContacts(prev => prev.map(c => selected.has(c.id) ? { ...c, acquisition_channel: bulkChannel } : c))
      toast.success(`${selected.size} contactos → canal "${bulkChannel}"`)
      setSelected(new Set()); setBulkChannel('')
    } catch (error: any) { toast.error(error.message) }
    finally { setBulkSaving(false) }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`¿Eliminar ${selected.size} contacto${selected.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    try {
      setBulkSaving(true)
      const res = await fetch('/api/data/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      if (!res.ok) throw new Error('Error al eliminar')
      toast.success(`${selected.size} contactos eliminados`)
      setSelected(new Set()); fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setBulkSaving(false) }
  }

  const handleXLSX = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheets = wb.SheetNames.map(name => {
        const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
        const rows = raw.map(r => ({
          name: [(r['Nombre'] || '').toString().trim(), (r['Apellido'] || '').toString().trim()].filter(Boolean).join(' '),
          phone: (r['Teléfono'] || r['Telefono'] || r['Tel'] || '').toString().replace(/\s/g, ''),
          email: (r['Emails'] || r['Email'] || '').toString().trim(),
          company: (r['Empresa'] || '').toString().trim(),
          address: (r['Dirección'] || r['Direccion'] || '').toString().trim(),
          postal_code: (r['Código Postal'] || r['Codigo Postal'] || r['CP'] || r['postal_code'] || '').toString().trim(),
          segment: (r['Etiquetas'] || r['Etiqueta '] || r['Etiqueta'] || name).toString().trim().toLowerCase(),
          acquisition_channel: (r['Canal de adquisición'] || r['Canal de adquisicion'] || r['Canal'] || '').toString().trim(),
          prospect_status: 'nuevo',
        })).filter(r => r.name && r.phone)
        return { name, rows, selected: rows.length > 0 }
      }).filter(s => s.rows.length > 0)
      setXlsxSheets(sheets); setXlsxModal(true)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleXLSXImport = async () => {
    const sel = xlsxSheets.filter(s => s.selected)
    const allRows = sel.flatMap(s => s.rows)
    if (!allRows.length) { toast.error('Selecciona al menos una hoja'); return }
    try {
      setXlsxImporting(true)
      let inserted = 0
      for (let i = 0; i < allRows.length; i += 500) {
        const res = await fetch('/api/data/contacts/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: allRows.slice(i, i + 500) }),
        })
        const r = await res.json()
        inserted += Array.isArray(r) ? r.length : 0
      }
      toast.success(`${inserted} importados · ${allRows.length - inserted} duplicados omitidos`)
      setXlsxModal(false); setXlsxSheets([]); fetchContacts()
    } catch (error: any) { toast.error(error.message) }
    finally { setXlsxImporting(false) }
  }

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    Papa.parse(file, {
      header: true,
      complete: async (results: any) => {
        try {
          const data = results.data.filter((r: any) => r.name && r.phone).map((r: any) => ({
            name: r.name, phone: r.phone, email: r.email || '', company: r.company || '',
            address: r.address || '', postal_code: r.postal_code || '', segment: r.segment || '',
            prospect_status: r.prospect_status || 'nuevo', acquisition_channel: r.acquisition_channel || '',
          }))
          const res = await fetch('/api/data/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: data }),
          })
          if (!res.ok) throw new Error('Error al importar')
          toast.success(`${data.length} contactos importados`)
          fetchContacts()
        } catch (error: any) { toast.error(error.message) }
      },
    })
  }

  const exportToExcel = (segmentFilter: string | null) => {
    setExportOpen(false)
    const rows = segmentFilter === null
      ? contacts
      : segmentFilter === '__sin__'
        ? contacts.filter(c => !c.segment)
        : contacts.filter(c => c.segment?.toLowerCase() === segmentFilter.toLowerCase())

    if (!rows.length) { toast('Sin contactos en esa categoría', { icon: '📭' }); return }

    const data = rows.map(c => ({
      'Nombre':             c.name || '',
      'Teléfono':           c.phone || '',
      'Email':              c.email || '',
      'Empresa':            c.company || '',
      'Dirección':          c.address || '',
      'CP':                 c.postal_code || '',
      'Segmento':           c.segment || '',
      'Estado prospecto':   c.prospect_status || '',
      'Canal adquisición':  c.acquisition_channel || '',
      'Fecha creación':     c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    // Anchos de columna
    ws['!cols'] = [20, 14, 28, 22, 32, 8, 16, 18, 20, 14].map(w => ({ wch: w }))

    const wb = XLSX.utils.book_new()
    const sheetName = segmentFilter === null ? 'Todos' : segmentFilter === '__sin__' ? 'Sin segmento' : segmentFilter.charAt(0).toUpperCase() + segmentFilter.slice(1)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const date = new Date().toISOString().split('T')[0]
    const filename = segmentFilter === null ? `contactos_todos_${date}.xlsx` : `contactos_${sheetName.toLowerCase()}_${date}.xlsx`
    XLSX.writeFile(wb, filename)
    toast.success(`${rows.length} contactos exportados`)
  }

  const handleBackup = () => {
    const date = new Date().toISOString().split('T')[0]
    const data = {
      exported_at: new Date().toISOString(),
      total_contacts: contacts.length,
      total_segments: segments.length,
      segments,
      contacts,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backup-contactos-${date}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Backup descargado · ${contacts.length} contactos · ${segments.length} segmentos`)
  }

  const activeFilters = [filterStatus, filterChannel].filter(Boolean).length

  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const statusSelectClass: Record<string, string> = {
    nuevo:      'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    contactado: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    interesado: 'border-green-300 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300',
    cliente:    'border-green-400 bg-green-100 text-green-800 dark:border-green-500 dark:bg-green-900/40 dark:text-green-200',
    rechazado:  'border-red-300 bg-red-50 text-red-700 dark:border-red-600 dark:bg-red-900/30 dark:text-red-300',
  }

  const getStatusSelectClass = (status: string) =>
    statusSelectClass[status] || 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'

  const handleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:text-blue-600 dark:hover:text-blue-400 transition"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortBy === field
          ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />)
          : <ChevronDown size={12} className="opacity-30" />}
      </span>
    </th>
  )

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 sm:py-8 pb-24 lg:pb-8 dark-mode-transition">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="flex justify-between items-center mb-5 gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-0.5 truncate">Contactos</h1>
              <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">{contacts.length.toLocaleString()} contactos · {tabs.length - 1} segmentos</p>
            </div>
            <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
              <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
                <Plus size={16} /> <span className="hidden xs:inline sm:inline">Nuevo</span>
              </Button>
              <label className="cursor-pointer">
                <div className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1 transition text-sm">
                  <Upload size={14} /> <span className="hidden sm:inline">CSV</span>
                </div>
                <input type="file" accept=".csv" onChange={handleCSV} className="hidden" />
              </label>
              <label className="cursor-pointer">
                <div className="bg-green-600 hover:bg-green-700 font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1 transition text-sm text-white">
                  <FileSpreadsheet size={14} /> <span className="hidden sm:inline">Excel</span>
                </div>
                <input type="file" accept=".xlsx,.xls" onChange={handleXLSX} className="hidden" />
              </label>
              <Button variant="secondary" size="sm" onClick={handleBackup} title="Descargar backup completo">
                <Download size={14} /> <span className="hidden sm:inline">Backup</span>
              </Button>

              {/* Exportar Excel con dropdown por segmento */}
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setExportOpen(v => !v)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1 transition text-sm"
                  title="Exportar a Excel"
                >
                  <TableProperties size={14} />
                  <span className="hidden sm:inline">Exportar</span>
                  <ChevronDown size={12} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
                </button>

                {exportOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-30">
                    <div className="px-3 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      Exportar como .xlsx
                    </div>
                    <button onClick={() => exportToExcel(null)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-gray-700 hover:text-emerald-700 dark:hover:text-white transition flex items-center justify-between">
                      Todos los contactos
                      <span className="text-xs text-gray-400">{contacts.length}</span>
                    </button>
                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    {segments.map(s => {
                      const count = contacts.filter(c => c.segment?.toLowerCase() === s.name.toLowerCase()).length
                      return (
                        <button key={s.id} onClick={() => exportToExcel(s.name)}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-gray-700 hover:text-emerald-700 dark:hover:text-white transition flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color || '#6b7280' }} />
                            {s.name}
                          </span>
                          <span className="text-xs text-gray-400">{count}</span>
                        </button>
                      )
                    })}
                    {contacts.some(c => !c.segment) && (
                      <button onClick={() => exportToExcel('__sin__')}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-emerald-50 dark:hover:bg-gray-700 hover:text-emerald-700 dark:hover:text-white transition flex items-center justify-between">
                        Sin segmento
                        <span className="text-xs text-gray-400">{contacts.filter(c => !c.segment).length}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Segment tabs — mobile: select, desktop: tab bar */}
          <div className="md:hidden mb-3">
            <select
              value={activeTab}
              onChange={e => { setActiveTab(e.target.value); setSelected(new Set()); setSearch('') }}
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
            >
              {tabs.map(tab => (
                <option key={tab.key} value={tab.key}>
                  {tab.label} ({tab.count})
                </option>
              ))}
            </select>
          </div>

          <div className="hidden md:flex flex-wrap items-end gap-0 mb-0 border-b-2 border-gray-200 dark:border-gray-700">
            {tabs.map(tab => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelected(new Set()); setSearch('') }}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-0.5"
                  style={{
                    borderBottomColor: isActive ? (tab.color || '#0369a1') : 'transparent',
                    color: isActive ? (tab.color || '#0369a1') : (isDark ? '#9ca3af' : '#6b7280'),
                    backgroundColor: isActive ? (tab.color || '#0369a1') + '20' : 'transparent',
                  }}
                >
                  {tab.key !== '__todos__' && tab.key !== '__sin_segmento__' && (
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tab.color }} />
                  )}
                  {tab.label}
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? (tab.color || '#0369a1') : (isDark ? '#374151' : '#e5e7eb'),
                      color: isActive ? '#fff' : (isDark ? '#9ca3af' : '#6b7280'),
                    }}
                  >
                    {tab.count.toLocaleString()}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Slide-over drawer: Nuevo Contacto */}
          <NuevoContactoDrawer
            open={showForm}
            onClose={() => setShowForm(false)}
            onSave={handleAdd}
            segments={allSegments}
            defaultSegment={activeTab !== '__todos__' && activeTab !== '__sin_segmento__' ? activeTab : ''}
          />

          {/* Search + filters bar */}
          <div className="flex gap-2 mt-4 mb-3">
            <div className="flex-1">
              <Input
                icon={<Search size={16} />}
                placeholder="Buscar nombre, teléfono, empresa, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition"
              style={{
                borderColor: activeFilters > 0 ? '#0369a1' : (isDark ? '#374151' : '#e5e7eb'),
                backgroundColor: activeFilters > 0 ? (isDark ? '#1e3a5f' : '#eff6ff') : (isDark ? '#1f2937' : '#fff'),
                color: activeFilters > 0 ? (isDark ? '#60a5fa' : '#0369a1') : (isDark ? '#9ca3af' : '#6b7280'),
              }}
            >
              <Filter size={15} />
              Filtros
              {activeFilters > 0 && <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5">{activeFilters}</span>}
              {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {(search || activeFilters > 0) && (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterChannel('') }} className="text-gray-400 hover:text-gray-600 px-1">
                <X size={16} />
              </button>
            )}
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 gap-3 mb-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm dark-mode-transition">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Estado</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  <option value="">Todos los estados</option>
                  {STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Canal de adquisición</label>
                <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  {channelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="mb-3 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 divide-y divide-blue-100 dark:divide-blue-900">
              {/* Row 1: counts + delete + close */}
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
                </span>
                <div className="flex-1" />
                <Button variant="danger" size="sm" loading={bulkSaving} onClick={handleBulkDelete}>
                  <Trash2 size={14} /> Eliminar seleccionados
                </Button>
                <button onClick={() => { setSelected(new Set()); setBulkSegment(''); setBulkChannel('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={17} />
                </button>
              </div>
              {/* Row 2: segment + channel bulk */}
              <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Segmento:</span>
                  <select
                    value={bulkSegment}
                    onChange={e => setBulkSegment(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Seleccionar...</option>
                    {allSegments.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Button variant="primary" size="sm" loading={bulkSaving} onClick={handleBulkSegment}>Aplicar</Button>
                </div>
                <div className="w-px h-5 bg-blue-200 dark:bg-blue-800" />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Canal de adquisición:</span>
                  <select
                    value={bulkChannel}
                    onChange={e => setBulkChannel(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    {ACQUISITION_CHANNELS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <Button variant="primary" size="sm" loading={bulkSaving} onClick={handleBulkChannel}>Aplicar</Button>
                </div>
              </div>
            </div>
          )}

          {/* Table / Cards */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : tabContacts.length === 0 ? (
            <Card variant="elevated" className="px-6 py-16 text-center">
              <p className="text-gray-400 text-base">No hay contactos en este segmento</p>
              <p className="text-gray-300 text-sm mt-1">Importa contactos o muévelos aquí desde otro segmento</p>
            </Card>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden space-y-2">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-blue-600 transition flex items-center gap-1.5 text-xs font-semibold">
                    {selected.size === tabContacts.length && tabContacts.length > 0
                      ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                    Seleccionar todos
                  </button>
                </div>
                {tabContacts.map((c, idx) => {
                  const seg = segments.find((s: any) => s.name.toLowerCase() === c.segment?.toLowerCase())
                  const isSelected = selected.has(c.id)
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border-2 transition p-4 flex gap-3 dark-mode-transition"
                      style={{
                        borderColor: isSelected ? '#93c5fd' : (isDark ? '#374151' : '#f3f4f6'),
                        backgroundColor: isSelected ? (isDark ? '#1e3a5f' : '#eff6ff') : (isDark ? '#1f2937' : '#fff'),
                      }}
                    >
                      {/* Checkbox */}
                      <button onClick={e => toggleSelect(c.id, idx, e)} className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-blue-600 transition">
                        {isSelected ? <CheckSquare size={17} className="text-blue-600" /> : <Square size={17} />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: name + status */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{c.name}</p>
                          <select
                            value={c.prospect_status || 'nuevo'}
                            onChange={e => handleStatusChange(c.id, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className={`text-xs font-semibold rounded-full border px-2 py-0.5 focus:outline-none cursor-pointer flex-shrink-0 ${getStatusSelectClass(c.prospect_status)}`}
                          >
                            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>

                        {/* Row 2: phone */}
                        <p className="font-mono text-sm text-gray-600 dark:text-gray-300 mb-1">{c.phone}</p>

                        {/* Row 3: email */}
                        {c.email && <p className="text-xs text-gray-400 dark:text-gray-500 truncate mb-1">{c.email}</p>}

                        {/* Row 4: company + channel */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {c.company && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">{c.company}</span>
                          )}
                          {c.acquisition_channel && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{c.acquisition_channel}</span>
                          )}
                          {activeTab === '__todos__' && c.segment && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                              style={{ backgroundColor: (seg?.color || '#6b7280') + '20', color: seg?.color || '#6b7280' }}>
                              {c.segment}
                            </span>
                          )}
                        </div>

                        {/* Row 5: segment description */}
                        {seg?.description && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 line-clamp-1">{seg.description}</p>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 mt-3">
                          <Link href={`/contactos/${c.id}`} className="flex-1">
                            <Button variant="secondary" size="sm" className="w-full justify-center"><Edit size={13} /> Editar</Button>
                          </Link>
                          {/^\d{10}$/.test(c.phone) && (
                            <a href={`https://wa.me/52${c.phone}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 transition">
                              <MessageCircle size={15} />
                            </a>
                          )}
                          <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}>
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div className="px-1 py-2 text-sm text-gray-500 dark:text-gray-400">
                  <strong>{tabContacts.length.toLocaleString()}</strong> contactos
                  {(search || activeFilters > 0) && ` (filtrado de ${activeTab === '__todos__' ? contacts.length : tabs.find(t => t.key === activeTab)?.count ?? 0})`}
                </div>
              </div>

              {/* Desktop: table */}
              <Card variant="elevated" className="overflow-hidden hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr style={{ backgroundColor: isDark ? '#1e3a5f' : '#f0f9ff', borderBottom: isDark ? '2px solid #1d4ed8' : '2px solid #bae6fd' }}>
                        <th className="px-3 py-2.5 w-8">
                          <button onClick={toggleSelectAll} className="text-gray-400 hover:text-blue-600 transition">
                            {selected.size === tabContacts.length && tabContacts.length > 0
                              ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                          </button>
                        </th>
                        <SortHeader field="name" label="Nombre" />
                        <SortHeader field="phone" label="Teléfono" />
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">C.P.</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">Canal</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Segmento</th>
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Descripción</th>
                        <SortHeader field="prospect_status" label="Estado" />
                        <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {tabContacts.map((c, idx) => (
                        <tr key={c.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition"
                          style={{ backgroundColor: selected.has(c.id) ? (isDark ? '#1e3a5f' : '#eff6ff') : undefined }}>
                          <td className="px-3 py-2.5">
                            <button onClick={e => toggleSelect(c.id, idx, e)} className="text-gray-300 hover:text-blue-600 transition">
                              {selected.has(c.id) ? <CheckSquare size={15} className="text-blue-600" /> : <Square size={15} />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 max-w-[180px]">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{c.name}</p>
                            {c.email && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.email}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 font-mono text-sm whitespace-nowrap">{c.phone}</td>
                          <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 text-sm font-mono whitespace-nowrap">{c.postal_code || '—'}</td>
                          <td className="px-3 py-2.5">
                            {c.acquisition_channel
                              ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 whitespace-nowrap">{c.acquisition_channel}</span>
                              : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {c.segment ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize whitespace-nowrap"
                                style={{ backgroundColor: (segments.find((s:any) => s.name.toLowerCase() === c.segment?.toLowerCase())?.color || '#6b7280') + '30', color: segments.find((s:any) => s.name.toLowerCase() === c.segment?.toLowerCase())?.color || '#6b7280' }}>
                                {c.segment}
                              </span>
                            ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5 max-w-[160px]">
                            {c.company
                              ? <span className="text-sm text-gray-600 dark:text-gray-300 truncate block">{c.company}</span>
                              : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <select
                              value={c.prospect_status || 'nuevo'}
                              onChange={e => handleStatusChange(c.id, e.target.value)}
                              className={`text-xs font-semibold rounded-full border px-2 py-0.5 focus:outline-none cursor-pointer whitespace-nowrap ${getStatusSelectClass(c.prospect_status)}`}
                            >
                              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1 items-center">
                              <Link href={`/contactos/${c.id}`}>
                                <Button variant="secondary" size="sm"><Edit size={13} /></Button>
                              </Link>
                              {/^\d{10}$/.test(c.phone) && (
                                <a href={`https://wa.me/52${c.phone}`} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50">
                                  <MessageCircle size={13} />
                                </a>
                              )}
                              <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}>
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                  <span>
                    <strong>{tabContacts.length.toLocaleString()}</strong> contactos
                    {(search || activeFilters > 0) && ` (filtrado de ${activeTab === '__todos__' ? contacts.length : tabs.find(t => t.key === activeTab)?.count ?? 0})`}
                  </span>
                  {selected.size > 0 && <span className="text-blue-600 font-semibold">{selected.size} seleccionados</span>}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Modal importar Excel */}
      {xlsxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col dark-mode-transition">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Importar desde Excel</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Selecciona las hojas que deseas importar</p>
              </div>
              <button onClick={() => setXlsxModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={22} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Total: <strong>{xlsxSheets.filter(s => s.selected).flatMap(s => s.rows).length.toLocaleString()}</strong> contactos
                </span>
                <div className="flex gap-3">
                  <button className="text-xs text-blue-600 font-semibold hover:underline" onClick={() => setXlsxSheets(s => s.map(sh => ({ ...sh, selected: true })))}>Todo</button>
                  <button className="text-xs text-gray-400 font-semibold hover:underline" onClick={() => setXlsxSheets(s => s.map(sh => ({ ...sh, selected: false })))}>Ninguno</button>
                </div>
              </div>
              {xlsxSheets.map((sheet, i) => (
                <button key={sheet.name} onClick={() => setXlsxSheets(s => s.map((sh, j) => j === i ? { ...sh, selected: !sh.selected } : sh))}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border-2 transition text-left"
                  style={{
                    borderColor: sheet.selected ? '#16a34a' : (isDark ? '#374151' : '#e5e7eb'),
                    backgroundColor: sheet.selected ? (isDark ? '#14532d' : '#f0fdf4') : (isDark ? '#1f2937' : '#fff'),
                  }}>
                  <div style={{ color: sheet.selected ? '#16a34a' : (isDark ? '#6b7280' : '#d1d5db') }}>
                    {sheet.selected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">{sheet.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sheet.rows.length.toLocaleString()} contactos</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{
                      backgroundColor: sheet.selected ? (isDark ? '#166534' : '#dcfce7') : (isDark ? '#374151' : '#f3f4f6'),
                      color: sheet.selected ? (isDark ? '#86efac' : '#15803d') : (isDark ? '#9ca3af' : '#9ca3af'),
                    }}>
                    {sheet.rows.length.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setXlsxModal(false)}>Cancelar</Button>
              <Button variant="primary" loading={xlsxImporting} onClick={handleXLSXImport} className="bg-green-600 hover:bg-green-700">
                <FileSpreadsheet size={16} />
                Importar {xlsxSheets.filter(s => s.selected).flatMap(s => s.rows).length.toLocaleString()} contactos
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FAB móvil: Nuevo Contacto */}
      <button
        onClick={() => setShowForm(true)}
        className="lg:hidden fixed bottom-20 right-4 z-40 w-14 h-14 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg flex items-center justify-center"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Nuevo contacto"
      >
        <Plus size={26} />
      </button>
    </>
  )
}
