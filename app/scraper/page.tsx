'use client'

import { useState, useMemo } from 'react'
import Navbar from '@/components/Navbar'
import { importContacts } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { Search, Download, MapPin, Phone, Wifi, Filter, X, SlidersHorizontal, AlertCircle, CheckCircle2 } from 'lucide-react'

type LocationType = 'cp' | 'ciudad'

function normalizePhone(phone: string): string {
  if (!phone) return ''
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('52') && d.length === 12) return d.slice(2)
  if (d.length === 10) return d
  if (d.length > 10) return d.slice(-10)
  return d
}

export default function Scraper() {
  // ── Formulario ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({ query: '', location: '', locationType: 'cp' as LocationType, source: 'inegi' })
  const [results, setResults] = useState<any[]>([])
  const [ciudad, setCiudad] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')

  // ── Selección ───────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // ── Duplicados ──────────────────────────────────────────────────────────────
  const [duplicatePhones, setDuplicatePhones] = useState<Set<string>>(new Set())
  const [duplicateNames, setDuplicateNames] = useState<Set<string>>(new Set())
  const [duplicateInegiIds, setDuplicateInegiIds] = useState<Set<string>>(new Set())
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)

  // ── Filtros post-búsqueda ───────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [filterPhone, setFilterPhone] = useState(false)
  const [filterWA, setFilterWA] = useState(false)
  const [filterSegment, setFilterSegment] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterHideDuplicates, setFilterHideDuplicates] = useState(false)

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isDuplicate = (r: any): boolean => {
    if (r.inegi_id && duplicateInegiIds.has(r.inegi_id)) return true
    if (r.phone && duplicatePhones.has(normalizePhone(r.phone))) return true
    if (!r.phone && r.name && duplicateNames.has(r.name.toLowerCase().trim())) return true
    return false
  }

  // resultados con índice original preservado
  const filteredResults = useMemo(() => {
    return results
      .map((r, i) => ({ ...r, _idx: i }))
      .filter(r => {
        if (filterHideDuplicates && isDuplicate(r)) return false
        if (filterPhone && !r.phone) return false
        if (filterWA && !r.whatsapp) return false
        if (filterSegment && r.segment !== filterSegment) return false
        if (filterSearch) {
          const q = filterSearch.toLowerCase()
          if (!(r.name?.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q) || r.activity?.toLowerCase().includes(q))) return false
        }
        return true
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, filterPhone, filterWA, filterSegment, filterSearch, filterHideDuplicates, duplicatePhones, duplicateNames, duplicateInegiIds])

  const duplicateCount = useMemo(() =>
    results.filter(r => isDuplicate(r)).length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [results, duplicatePhones, duplicateNames, duplicateInegiIds])

  const activeFilterCount = [filterPhone, filterWA, !!filterSegment, !!filterSearch, filterHideDuplicates].filter(Boolean).length
  const uniqueSegments = useMemo(() => [...new Set(results.map(r => r.segment).filter(Boolean))].sort(), [results])

  // ── Check duplicados (async, no bloquea UI) ─────────────────────────────────
  const checkDuplicates = async (data: any[]) => {
    if (!data.length) return
    setCheckingDuplicates(true)
    try {
      const phones = data.map(r => r.phone).filter(Boolean)
      const names = data.filter(r => !r.phone).map(r => r.name).filter(Boolean)
      const inegi_ids = data.map(r => r.inegi_id).filter(Boolean)

      const res = await fetch('/api/contacts/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones, names, inegi_ids }),
      })
      const json = await res.json()
      setDuplicatePhones(new Set(json.existingPhones || []))
      setDuplicateNames(new Set(json.existingNames || []))
      setDuplicateInegiIds(new Set(json.existingInegiIds || []))
    } catch {
      // Falla silenciosamente
    } finally {
      setCheckingDuplicates(false)
    }
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.query || !form.location) {
      toast.error('Ingresa giro y ' + (form.locationType === 'cp' ? 'código postal' : 'municipio/ciudad'))
      return
    }
    try {
      setLoading(true)
      setHint('')
      setResults([])
      setSelected(new Set())
      setDuplicatePhones(new Set())
      setDuplicateNames(new Set())
      setDuplicateInegiIds(new Set())
      setFilterPhone(false); setFilterWA(false); setFilterSegment(''); setFilterSearch(''); setFilterHideDuplicates(false)
      setLoadingMsg(form.locationType === 'cp' ? 'Geolocalizar código postal...' : 'Geolocalizar municipio...')

      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: form.query, location: form.location, locationType: form.locationType, source: form.source }),
      })

      setLoadingMsg('Buscando negocios en el área...')
      const data = await res.json()
      if (res.status === 429) throw new Error(data.error)
      if (!res.ok) throw new Error(data.error)

      const newResults = data.data || []
      setResults(newResults)
      setCiudad(data.ciudad || '')
      setHint(data.hint || '')

      if (newResults.length > 0) {
        toast.success(`${newResults.length} resultados encontrados`)
        checkDuplicates(newResults) // async — no bloquea
      } else {
        toast.error('Sin resultados — prueba con otro término o zona')
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al buscar')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const toggleSelect = (idx: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }

  const toggleAll = () => {
    // Al seleccionar todo, excluye duplicados por defecto
    const allVisible = filteredResults.map(r => r._idx)
    const nonDuplicates = allVisible.filter(i => !isDuplicate(results[i]))
    const allNonDupSelected = nonDuplicates.length > 0 && nonDuplicates.every(i => selected.has(i))

    setSelected(prev => {
      const n = new Set(prev)
      if (allNonDupSelected) {
        allVisible.forEach(i => n.delete(i))
      } else {
        nonDuplicates.forEach(i => n.add(i))
      }
      return n
    })
  }

  const handleImport = async () => {
    if (selected.size === 0) { toast.error('Selecciona al menos uno'); return }
    try {
      const channelLabel = form.source === 'inegi' ? 'INEGI DENUE' : 'Google Maps'
      const toImport = [...selected].map(i => ({
        name: results[i].name,
        phone: results[i].phone || '',
        email: results[i].email || '',
        company: results[i].name,
        address: results[i].address || '',
        segment: results[i].segment || '',
        prospect_status: 'nuevo',
        acquisition_channel: channelLabel,
      })).filter(r => r.name)

      const result = await importContacts(toImport)
      const actual = result?.length ?? toImport.length
      const skipped = toImport.length - actual

      if (skipped > 0) {
        toast.success(`${actual} importados · ${skipped} omitidos (ya existían)`)
      } else {
        toast.success(`${actual} contactos importados`)
      }
      setSelected(new Set())
      // Refrescar duplicados tras import
      checkDuplicates(results)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const withPhone = results.filter(r => r.phone).length
  const withWA = results.filter(r => r.whatsapp).length
  const allVisibleNonDupSelected = (() => {
    const nonDups = filteredResults.filter(r => !isDuplicate(r))
    return nonDups.length > 0 && nonDups.every(r => selected.has(r._idx))
  })()
  const selectedInView = filteredResults.filter(r => selected.has(r._idx)).length
  const selectedDuplicates = [...selected].filter(i => isDuplicate(results[i])).length

  return (
    <>
      <Navbar />

      {/* Loading bar */}
      {loading && (
        <div className="w-full">
          <div className="h-1 bg-blue-100 dark:bg-blue-900/40">
            <div className="h-full bg-blue-600 animate-progress-bar" />
          </div>
          <div className="bg-blue-600 text-white text-xs text-center py-1.5 font-medium tracking-wide">
            {loadingMsg}
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark-mode-transition">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Scraper de Prospectos</h1>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">Busca negocios por código postal o municipio en INEGI DENUE / Google Maps</p>
          </div>

          {/* ── Formulario ───────────────────────────────────────────────────── */}
          <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 dark-mode-transition">

            {/* Toggle CP / Ciudad */}
            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
              {(['cp', 'ciudad'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, locationType: t, location: '' })}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold transition ${
                    form.locationType === t
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {t === 'cp' ? 'Código Postal' : 'Municipio / Ciudad'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  Giro / Actividad
                </label>
                <input
                  type="text"
                  placeholder="ej: pintura, ferretería, taller"
                  value={form.query}
                  onChange={e => setForm({ ...form, query: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition focus:outline-none focus:border-blue-500 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                  {form.locationType === 'cp' ? 'Código Postal' : 'Municipio / Ciudad'}
                </label>
                {form.locationType === 'cp' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="ej: 64000"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition focus:outline-none focus:border-blue-500 text-sm"
                    maxLength={5}
                    required
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="ej: Monterrey, Nuevo León"
                    value={form.location}
                    onChange={e => setForm({ ...form, location: e.target.value })}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition focus:outline-none focus:border-blue-500 text-sm"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Fuente</label>
                <select
                  value={form.source}
                  onChange={e => setForm({ ...form, source: e.target.value })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="inegi">INEGI DENUE</option>
                  <option value="google_maps">Google Maps</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm transition"
              >
                <Search size={16} />
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

            {ciudad && (
              <div className="flex items-center gap-1.5 mt-3 text-sm text-gray-500 dark:text-gray-400">
                <MapPin size={14} />
                <strong className="text-gray-700 dark:text-gray-200">{ciudad}</strong>
              </div>
            )}
          </form>

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl h-14 border border-gray-100 dark:border-gray-700" />
              ))}
            </div>
          )}

          {/* Hint */}
          {!loading && hint && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
              💡 {hint}
            </div>
          )}

          {/* ── Resultados ───────────────────────────────────────────────────── */}
          {!loading && results.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center border-l-4 border-blue-500 dark-mode-transition">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{results.length}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Negocios</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center border-l-4 border-green-500 dark-mode-transition">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Phone size={14} className="text-green-600" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{withPhone}</p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Con teléfono</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center border-l-4 border-emerald-500 dark-mode-transition">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Wifi size={14} className="text-emerald-600" />
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{withWA}</p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Posible WhatsApp</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center border-l-4 border-orange-400 dark-mode-transition">
                  {checkingDuplicates ? (
                    <div className="flex flex-col items-center justify-center h-full gap-1">
                      <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-gray-400 dark:text-gray-500">Verificando...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <AlertCircle size={14} className="text-orange-500" />
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{duplicateCount}</p>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Ya guardados</p>
                    </>
                  )}
                </div>
              </div>

              {/* ── Panel de filtros ─────────────────────────────────────────── */}
              <div className="mb-3">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                    activeFilterCount > 0
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  <SlidersHorizontal size={15} />
                  Filtrar resultados
                  {activeFilterCount > 0 && (
                    <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{activeFilterCount}</span>
                  )}
                </button>

                {showFilters && (
                  <div className="mt-2 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm dark-mode-transition">
                    <div className="flex flex-wrap gap-3 items-center">

                      {/* Toggle: Solo con teléfono */}
                      <button
                        type="button"
                        onClick={() => setFilterPhone(!filterPhone)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                          filterPhone
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-green-500'
                        }`}
                      >
                        <Phone size={12} /> Solo con teléfono
                      </button>

                      {/* Toggle: Solo con WhatsApp */}
                      <button
                        type="button"
                        onClick={() => setFilterWA(!filterWA)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                          filterWA
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-emerald-500'
                        }`}
                      >
                        <Wifi size={12} /> Solo con WhatsApp
                      </button>

                      {/* Toggle: Ocultar ya guardados */}
                      {duplicateCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterHideDuplicates(!filterHideDuplicates)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                            filterHideDuplicates
                              ? 'bg-orange-500 border-orange-500 text-white'
                              : 'bg-white dark:bg-gray-700 border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:border-orange-500'
                          }`}
                        >
                          <AlertCircle size={12} /> Ocultar ya guardados ({duplicateCount})
                        </button>
                      )}

                      {/* Segmento */}
                      {uniqueSegments.length > 1 && (
                        <select
                          value={filterSegment}
                          onChange={e => setFilterSegment(e.target.value)}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 dark-mode-transition"
                        >
                          <option value="">Todos los segmentos</option>
                          {uniqueSegments.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      )}

                      {/* Búsqueda en resultados */}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Buscar en resultados..."
                          value={filterSearch}
                          onChange={e => setFilterSearch(e.target.value)}
                          className="w-full pl-7 pr-7 py-1.5 rounded-full text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-500 dark-mode-transition"
                        />
                        {filterSearch && (
                          <button onClick={() => setFilterSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <X size={11} />
                          </button>
                        )}
                      </div>

                      {/* Limpiar filtros */}
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={() => { setFilterPhone(false); setFilterWA(false); setFilterSegment(''); setFilterSearch(''); setFilterHideDuplicates(false) }}
                          className="text-xs text-gray-400 hover:text-red-500 transition underline"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    {/* Resumen */}
                    {activeFilterCount > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Mostrando <strong>{filteredResults.length}</strong> de {results.length} negocios
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Barra de acciones ────────────────────────────────────────── */}
              <div className="flex justify-between items-center mb-3 gap-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={allVisibleNonDupSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-600"
                    title="Seleccionar todo (excluye ya guardados)"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selected.size > 0 ? `${selected.size} seleccionados` : `${filteredResults.length} resultados`}
                    {activeFilterCount > 0 && selected.size === 0 && ` (filtrado de ${results.length})`}
                  </span>
                  {selected.size > 0 && selectedDuplicates > 0 && (
                    <span className="text-xs text-orange-500 dark:text-orange-400 font-medium">
                      · {selectedDuplicates} ya guardado{selectedDuplicates !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {selected.size > 0 && (
                  <button
                    onClick={handleImport}
                    className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold transition"
                  >
                    <Download size={15} />
                    Importar {selected.size} contacto{selected.size !== 1 ? 's' : ''}
                  </button>
                )}
              </div>

              {/* Tabla desktop */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-auto dark-mode-transition hidden md:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <tr>
                      <th className="px-3 py-3 w-8"></th>
                      <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300 font-semibold">Nombre</th>
                      <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300 font-semibold">Teléfono</th>
                      <th className="px-3 py-3 text-center text-gray-700 dark:text-gray-300 font-semibold">WA</th>
                      <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300 font-semibold">Dirección</th>
                      <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300 font-semibold">Actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map(r => {
                      const dup = isDuplicate(r)
                      return (
                        <tr
                          key={r._idx}
                          className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition ${
                            selected.has(r._idx)
                              ? 'bg-blue-50 dark:bg-blue-950/30'
                              : dup
                              ? 'bg-orange-50/60 dark:bg-orange-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                          }`}
                          onClick={() => toggleSelect(r._idx)}
                        >
                          <td className="px-3 py-3">
                            <input type="checkbox" checked={selected.has(r._idx)} onChange={() => toggleSelect(r._idx)} onClick={e => e.stopPropagation()} className="w-4 h-4 accent-blue-600" />
                          </td>
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white max-w-[220px]">
                            <div className="flex items-center gap-2 truncate">
                              <span className="truncate">{r.name}</span>
                              {dup && (
                                <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-semibold">
                                  <CheckCircle2 size={10} /> Guardado
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {r.phone
                              ? <span className="font-mono text-gray-700 dark:text-gray-300">{r.phone}</span>
                              : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {r.whatsapp_link
                              ? <a href={r.whatsapp_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 bg-green-500 text-white text-xs px-2 py-1 rounded hover:bg-green-600">WA</a>
                              : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                          </td>
                          <td className="px-3 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[220px] truncate">{r.address}</td>
                          <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{r.activity || r.segment}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredResults.length === 0 && (
                  <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Ningún resultado coincide con los filtros activos
                  </div>
                )}
              </div>

              {/* Cards mobile */}
              <div className="md:hidden space-y-2">
                {filteredResults.map(r => {
                  const dup = isDuplicate(r)
                  return (
                    <div
                      key={r._idx}
                      onClick={() => toggleSelect(r._idx)}
                      className={`rounded-xl border-2 p-3 cursor-pointer transition dark-mode-transition ${
                        selected.has(r._idx)
                          ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                          : dup
                          ? 'border-orange-200 dark:border-orange-800/50 bg-orange-50/60 dark:bg-orange-950/10'
                          : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input type="checkbox" checked={selected.has(r._idx)} onChange={() => toggleSelect(r._idx)} onClick={e => e.stopPropagation()} className="mt-1 w-4 h-4 accent-blue-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{r.name}</p>
                            {dup && (
                              <span className="inline-flex items-center gap-0.5 text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                                <CheckCircle2 size={10} /> Guardado
                              </span>
                            )}
                          </div>
                          {r.phone && <p className="font-mono text-sm text-gray-600 dark:text-gray-300 mt-0.5">{r.phone}</p>}
                          {r.address && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{r.address}</p>}
                          <div className="flex items-center gap-2 mt-1.5">
                            {r.whatsapp_link && (
                              <a href={r.whatsapp_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs bg-green-500 text-white px-2 py-0.5 rounded font-semibold">WA</a>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${segmentColor(r.segment)}`}>{r.activity || r.segment}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {filteredResults.length === 0 && (
                  <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Ningún resultado coincide con los filtros activos
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

function segmentColor(segment: string): string {
  const map: Record<string, string> = {
    construccion: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    retail: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    industrial: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    automotriz: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300',
    residencial: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  }
  return map[segment] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
}
