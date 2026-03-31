'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import { importContacts } from '@/lib/supabase'
import toast from 'react-hot-toast'
import { Search, Download, MapPin, Phone, Wifi } from 'lucide-react'

export default function Scraper() {
  const [form, setForm] = useState({ query: '', cp: '', source: 'inegi' })
  const [results, setResults] = useState<any[]>([])
  const [ciudad, setCiudad] = useState('')
  const [hint, setHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.query || !form.cp) {
      toast.error('Ingresa giro y código postal')
      return
    }
    try {
      setLoading(true)
      setHint('')
      setResults([])
      setSelected(new Set())
      setLoadingMsg('Geolocalizar código postal...')

      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      setLoadingMsg('Buscando negocios en el área...')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setResults(data.data || [])
      setCiudad(data.ciudad || '')
      setHint(data.hint || '')

      if (data.data?.length > 0) {
        toast.success(`${data.data.length} resultados encontrados`)
      } else {
        toast.error('Sin resultados — prueba con otro término')
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al buscar')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  const toggleSelect = (idx: number) => {
    const next = new Set(selected)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setSelected(next)
  }

  const toggleAll = () => {
    setSelected(selected.size === results.length ? new Set() : new Set(results.map((_, i) => i)))
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

      await importContacts(toImport)
      toast.success(`${toImport.length} contactos importados`)
      setSelected(new Set())
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  const withPhone = results.filter(r => r.phone).length
  const withWA = results.filter(r => r.whatsapp).length

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 dark-mode-transition">

        {/* Loading bar */}
        {loading && (
          <div className="fixed top-0 left-0 right-0 z-50">
            <div className="h-1 bg-blue-200 dark:bg-blue-900">
              <div className="h-full bg-blue-600 animate-progress-bar" />
            </div>
            <div className="bg-blue-600 text-white text-xs text-center py-1.5 font-medium tracking-wide">
              {loadingMsg}
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Scraper de Prospectos</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Busca negocios en INEGI DENUE o Google Maps por código postal</p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 dark-mode-transition">
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
                  Código Postal
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ej: 64000"
                  value={form.cp}
                  onChange={e => setForm({ ...form, cp: e.target.value.replace(/\D/g, '').slice(0, 5) })}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition focus:outline-none focus:border-blue-500 text-sm"
                  maxLength={5}
                  required
                />
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
                <span><strong className="text-gray-700 dark:text-gray-200">{ciudad}</strong></span>
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

          {/* Hint when no results */}
          {!loading && hint && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-300">
              💡 {hint}
            </div>
          )}

          {/* Resultados */}
          {!loading && results.length > 0 && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
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
              </div>

              {/* Acciones */}
              <div className="flex justify-between items-center mb-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={selected.size === results.length && results.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{selected.size} seleccionados</span>
                </div>
                {selected.size > 0 && (
                  <button
                    onClick={handleImport}
                    className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-semibold transition"
                  >
                    <Download size={15} />
                    Importar {selected.size} contactos
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
                    {results.map((r, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition ${selected.has(idx) ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                        onClick={() => toggleSelect(idx)}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(idx)}
                            onChange={() => toggleSelect(idx)}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 accent-blue-600"
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{r.name}</td>
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
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards mobile */}
              <div className="md:hidden space-y-2">
                {results.map((r, idx) => (
                  <div
                    key={idx}
                    onClick={() => toggleSelect(idx)}
                    className={`rounded-xl border-2 p-3 cursor-pointer transition dark-mode-transition ${
                      selected.has(idx)
                        ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" checked={selected.has(idx)} onChange={() => toggleSelect(idx)} onClick={e => e.stopPropagation()} className="mt-1 w-4 h-4 accent-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{r.name}</p>
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
                ))}
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
