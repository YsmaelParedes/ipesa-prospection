'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import { importContacts } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function Scraper() {
  const [form, setForm] = useState({ query: '', cp: '', source: 'inegi' })
  const [results, setResults] = useState<any[]>([])
  const [ciudad, setCiudad] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.query || !form.cp) {
      toast.error('Ingresa giro y código postal')
      return
    }
    try {
      setLoading(true)
      setResults([])
      setSelected(new Set())
      const res = await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.data || [])
      setCiudad(data.ciudad || '')
      toast.success(`${data.data.length} resultados para CP ${form.cp}`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (idx: number) => {
    const next = new Set(selected)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    setSelected(next)
  }

  const toggleAll = () => {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map((_, i) => i)))
    }
  }

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error('Selecciona al menos uno')
      return
    }
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">Scraper de Prospectos</h1>

        {/* Formulario */}
        <form onSubmit={handleSearch} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-6 dark-mode-transition">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Giro / Actividad</label>
              <input
                type="text"
                placeholder="ej: ferreteria, pintura, taller"
                value={form.query}
                onChange={e => setForm({ ...form, query: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Código Postal</label>
              <input
                type="text"
                placeholder="ej: 64000"
                value={form.cp}
                onChange={e => setForm({ ...form, cp: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition"
                maxLength={5}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">Fuente</label>
              <select
                value={form.source}
                onChange={e => setForm({ ...form, source: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white dark-mode-transition"
              >
                <option value="inegi">INEGI DENUE</option>
                <option value="google_maps">Google Maps</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white py-2 px-6 rounded hover:bg-blue-700 disabled:opacity-50 font-semibold"
            >
              {loading ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {ciudad && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Zona: <strong>{ciudad}</strong></p>
          )}
        </form>

        {/* Resultados */}
        {results.length > 0 && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center border-l-4 border-blue-500 dark-mode-transition">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{results.length}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Negocios encontrados</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center border-l-4 border-green-500 dark-mode-transition">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{withPhone}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Con teléfono</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center border-l-4 border-emerald-500 dark-mode-transition">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{withWA}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Posible WhatsApp</p>
              </div>
            </div>

            {/* Acciones */}
            <div className="flex justify-between items-center mb-3">
              <div className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={selected.size === results.length}
                  onChange={toggleAll}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">{selected.size} seleccionados</span>
              </div>
              {selected.size > 0 && (
                <button
                  onClick={handleImport}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm font-semibold"
                >
                  Importar {selected.size} contactos
                </button>
              )}
            </div>

            {/* Tabla */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto dark-mode-transition">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-3 py-3 w-8"></th>
                    <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300">Nombre</th>
                    <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300">Teléfono</th>
                    <th className="px-3 py-3 text-center text-gray-700 dark:text-gray-300">WhatsApp</th>
                    <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300">Dirección</th>
                    <th className="px-3 py-3 text-left text-gray-700 dark:text-gray-300">Segmento</th>
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
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{r.name}</td>
                      <td className="px-3 py-3">
                        {r.phone ? (
                          <span className="font-mono text-gray-700 dark:text-gray-300">{r.phone}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">Sin teléfono</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.whatsapp_link ? (
                          <a
                            href={r.whatsapp_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 bg-green-500 text-white text-xs px-2 py-1 rounded hover:bg-green-600"
                          >
                            WA
                          </a>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400 text-xs">{r.address}</td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${segmentColor(r.segment)}`}>
                          {r.segment}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
