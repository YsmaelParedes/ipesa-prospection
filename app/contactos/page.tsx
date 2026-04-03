'use client'

import { useEffect, useState, useMemo } from 'react'
import { getContacts, addContact, deleteContact, deleteContacts, importContacts, updateContact, getSegments } from '@/lib/supabase'
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
import { Plus, Upload, Trash2, Edit, Search, FileSpreadsheet, X, CheckSquare, Square, Filter, ChevronDown, ChevronUp, Download } from 'lucide-react'

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

export default function Contactos() {
  const [contacts, setContacts] = useState<any[]>([])
  const [segments, setSegments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('__todos__')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', address: '', postal_code: '', segment: '', prospect_status: 'nuevo', acquisition_channel: '' })

  // Search & filters within tab
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSegment, setBulkSegment] = useState('')
  const [bulkChannel, setBulkChannel] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Excel
  const [xlsxModal, setXlsxModal] = useState(false)
  const [xlsxSheets, setXlsxSheets] = useState<{ name: string; rows: any[]; selected: boolean }[]>([])
  const [xlsxImporting, setXlsxImporting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [cts, segs] = await Promise.all([getContacts(), getSegments()])
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

  // Contacts for active tab + search/filters
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
    })
  }, [contacts, activeTab, search, filterStatus, filterChannel])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.phone) { toast.error('Nombre y teléfono son requeridos'); return }
    try {
      await addContact({ ...form, segment: form.segment || (activeTab !== '__todos__' && activeTab !== '__sin_segmento__' ? activeTab : '') })
      toast.success('Contacto agregado')
      setForm({ name: '', phone: '', email: '', company: '', address: '', postal_code: '', segment: '', prospect_status: 'nuevo', acquisition_channel: '' })
      setShowForm(false)
      fetchContacts()
    } catch (error: any) { toast.error(error.message || 'Error al agregar') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar contacto?')) return
    try {
      await deleteContact(id)
      toast.success('Eliminado')
      fetchAll()
    } catch { toast.error('Error al eliminar') }
  }

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleSelectAll = () =>
    setSelected(selected.size === tabContacts.length && tabContacts.length > 0
      ? new Set() : new Set(tabContacts.map(c => c.id)))

  const handleBulkSegment = async () => {
    if (!bulkSegment) { toast.error('Selecciona un segmento'); return }
    if (selected.size === 0) return
    try {
      setBulkSaving(true)
      await Promise.all([...selected].map(id => updateContact(id, { segment: bulkSegment })))
      toast.success(`${selected.size} contactos → "${bulkSegment}"`)
      setSelected(new Set()); setBulkSegment(''); fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setBulkSaving(false) }
  }

  const handleBulkChannel = async () => {
    if (!bulkChannel) { toast.error('Selecciona un canal de adquisición'); return }
    if (selected.size === 0) return
    try {
      setBulkSaving(true)
      await Promise.all([...selected].map(id => updateContact(id, { acquisition_channel: bulkChannel })))
      toast.success(`${selected.size} contactos → canal "${bulkChannel}"`)
      setSelected(new Set()); setBulkChannel(''); fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setBulkSaving(false) }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`¿Eliminar ${selected.size} contacto${selected.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    try {
      setBulkSaving(true)
      await deleteContacts([...selected])
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
        const r = await importContacts(allRows.slice(i, i + 500)); inserted += r?.length ?? 0
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
          await importContacts(data)
          toast.success(`${data.length} contactos importados`)
          fetchContacts()
        } catch (error: any) { toast.error(error.message) }
      },
    })
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

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 sm:py-8 dark-mode-transition">
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

          {/* New contact form */}
          {showForm && (
            <Card variant="elevated" className="p-6 mt-4 mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Nuevo Contacto</h2>
              <form onSubmit={handleAdd}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <Input label="Nombre *" placeholder="Juan Pérez" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  <Input label="Teléfono *" placeholder="222 123 4567" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  <Input label="Email" placeholder="juan@empresa.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  <Input label="Empresa" placeholder="Acme Corp" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} />
                  <Input label="Dirección" placeholder="Calle 123, Puebla" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
                  <Input label="Código Postal" placeholder="72000" value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} />
                  <Select label="Canal de adquisición" value={form.acquisition_channel} onChange={e => setForm({ ...form, acquisition_channel: e.target.value })} options={ACQUISITION_CHANNELS} />
                  <Select
                    label="Segmento"
                    value={form.segment}
                    onChange={e => setForm({ ...form, segment: e.target.value })}
                    options={[
                      { value: '', label: 'Sin segmento' },
                      ...allSegments.map(s => ({ value: s, label: s })),
                    ]}
                  />
                  <Select label="Estado" value={form.prospect_status} onChange={e => setForm({ ...form, prospect_status: e.target.value })} options={STATUSES} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Guardar</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </form>
            </Card>
          )}

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
                {tabContacts.map(c => {
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
                      <button onClick={() => toggleSelect(c.id)} className="mt-0.5 flex-shrink-0 text-gray-300 hover:text-blue-600 transition">
                        {isSelected ? <CheckSquare size={17} className="text-blue-600" /> : <Square size={17} />}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: name + status */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{c.name}</p>
                          <Badge variant={statusBadge[c.prospect_status]}>{statusLabel[c.prospect_status] || c.prospect_status}</Badge>
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
                  <table className="w-full">
                    <thead>
                      <tr style={{ backgroundColor: isDark ? '#1e3a5f' : '#f0f9ff', borderBottom: isDark ? '2px solid #1d4ed8' : '2px solid #bae6fd' }}>
                        <th className="px-4 py-3 w-10">
                          <button onClick={toggleSelectAll} className="text-gray-400 hover:text-blue-600 transition">
                            {selected.size === tabContacts.length && tabContacts.length > 0
                              ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                          </button>
                        </th>
                        {['Nombre', 'Teléfono', 'Empresa', 'C.P.', 'Canal de adquisición', 'Segmento', 'Descripción', 'Estado', 'Acciones'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {tabContacts.map(c => (
                        <tr key={c.id} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 transition"
                          style={{ backgroundColor: selected.has(c.id) ? (isDark ? '#1e3a5f' : '#eff6ff') : undefined }}>
                          <td className="px-4 py-3">
                            <button onClick={() => toggleSelect(c.id)} className="text-gray-300 hover:text-blue-600 transition">
                              {selected.has(c.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">{c.name}</p>
                            {c.email && <p className="text-xs text-gray-400 dark:text-gray-500">{c.email}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-sm">{c.phone}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{c.company || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm font-mono">{c.postal_code || '—'}</td>
                          <td className="px-4 py-3">
                            {c.acquisition_channel
                              ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">{c.acquisition_channel}</span>
                              : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {c.segment ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                                style={{ backgroundColor: (segments.find((s:any) => s.name.toLowerCase() === c.segment?.toLowerCase())?.color || '#6b7280') + '30', color: segments.find((s:any) => s.name.toLowerCase() === c.segment?.toLowerCase())?.color || '#6b7280' }}>
                                {c.segment}
                              </span>
                            ) : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm max-w-xs truncate">
                            {(() => {
                              const seg = segments.find((s:any) => s.name.toLowerCase() === c.segment?.toLowerCase())
                              return seg?.description || <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusBadge[c.prospect_status]}>{statusLabel[c.prospect_status] || c.prospect_status}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <Link href={`/contactos/${c.id}`}>
                                <Button variant="secondary" size="sm"><Edit size={14} /></Button>
                              </Link>
                              <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}>
                                <Trash2 size={14} />
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
    </>
  )
}
