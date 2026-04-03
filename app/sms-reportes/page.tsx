'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import toast from 'react-hot-toast'
import {
  MessageSquare, Search, RefreshCw, CheckCircle, XCircle, Clock,
  AlertTriangle, BarChart3, Send, TrendingUp, Filter,
} from 'lucide-react'

interface SmsReport {
  reference: string
  number: string
  message: string
  status: number
  sent_date: string
}

const STATUS_MAP: Record<number, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  1: { label: 'Entregado',  bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',  icon: <CheckCircle size={12} /> },
  2: { label: 'Fallido',    bg: 'bg-red-100 dark:bg-red-900/30',      text: 'text-red-700 dark:text-red-300',      icon: <XCircle size={12} /> },
  3: { label: 'Pendiente',  bg: 'bg-yellow-100 dark:bg-yellow-900/30',text: 'text-yellow-700 dark:text-yellow-300',icon: <Clock size={12} /> },
  4: { label: 'Expirado',   bg: 'bg-gray-100 dark:bg-gray-700',       text: 'text-gray-600 dark:text-gray-400',    icon: <AlertTriangle size={12} /> },
  5: { label: 'Rechazado',  bg: 'bg-red-100 dark:bg-red-900/30',      text: 'text-red-700 dark:text-red-300',      icon: <XCircle size={12} /> },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toApiDate(date: string, endOfDay = false): string {
  return `${date} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export default function SmsReportes() {
  const [startDate, setStartDate]   = useState(daysAgoStr(7))
  const [endDate, setEndDate]       = useState(todayStr())
  const [report, setReport]         = useState<SmsReport[]>([])
  const [loading, setLoading]       = useState(false)
  const [fetched, setFetched]       = useState(false)
  const [search, setSearch]         = useState('')

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/sms-masivos/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: toApiDate(startDate),
          end_date:   toApiDate(endDate, true),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport(data.report || [])
      setFetched(true)
      if ((data.report || []).length === 0) toast('Sin registros en ese período', { icon: '📭' })
    } catch (err: any) {
      toast.error('Error al obtener reporte: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const quickRange = (days: number) => {
    setStartDate(daysAgoStr(days))
    setEndDate(todayStr())
  }

  const filtered = report.filter(r =>
    !search ||
    r.number.includes(search) ||
    r.message.toLowerCase().includes(search.toLowerCase()) ||
    r.reference.toLowerCase().includes(search.toLowerCase())
  )

  // ── Stats ──────────────────────────────────────────────────────────
  const total      = report.length
  const entregados = report.filter(r => r.status === 1).length
  const fallidos   = report.filter(r => [2, 5].includes(r.status)).length
  const pendientes = report.filter(r => r.status === 3).length
  const tasa       = total > 0 ? Math.round((entregados / total) * 100) : 0

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white">Reportes SMS</h1>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-700">
                  <MessageSquare size={12} /> SMS Masivos
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Historial y analíticas de mensajes enviados a través de SMS Masivos
              </p>
            </div>
          </div>

          {/* Filtros de fecha */}
          <Card variant="elevated" className="p-5 mb-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Desde</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  max={endDate}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  min={startDate} max={todayStr()}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400" />
              </div>

              {/* Accesos rápidos */}
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { label: 'Hoy',       days: 0 },
                  { label: '7 días',    days: 7 },
                  { label: '30 días',   days: 30 },
                  { label: '90 días',   days: 90 },
                ].map(({ label, days }) => (
                  <button key={label}
                    onClick={() => days === 0 ? (setStartDate(todayStr()), setEndDate(todayStr())) : quickRange(days)}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 transition bg-white dark:bg-gray-700">
                    {label}
                  </button>
                ))}
              </div>

              <button onClick={fetchReport} disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-60 transition ml-auto">
                {loading
                  ? <><RefreshCw size={15} className="animate-spin" /> Consultando...</>
                  : <><BarChart3 size={15} /> Consultar reporte</>
                }
              </button>
            </div>
          </Card>

          {/* Stats */}
          {fetched && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <Card variant="elevated" className="p-4 text-center">
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{total.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                  <Send size={11} /> Total enviados
                </p>
              </Card>
              <Card variant="elevated" className="p-4 text-center">
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{entregados.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                  <CheckCircle size={11} /> Entregados
                </p>
              </Card>
              <Card variant="elevated" className="p-4 text-center">
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{fallidos.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                  <XCircle size={11} /> Fallidos
                </p>
              </Card>
              <Card variant="elevated" className="p-4 text-center">
                <p className={`text-3xl font-bold ${tasa >= 90 ? 'text-green-700 dark:text-green-300' : tasa >= 70 ? 'text-yellow-600 dark:text-yellow-300' : 'text-red-600 dark:text-red-400'}`}>
                  {tasa}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">
                  <TrendingUp size={11} /> Tasa de entrega
                </p>
              </Card>
            </div>
          )}

          {/* Barra de estado visual */}
          {fetched && total > 0 && (
            <Card variant="elevated" className="p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Distribución de estados — SMS Masivos</p>
                {pendientes > 0 && (
                  <span className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                    <Clock size={11} /> {pendientes} pendientes
                  </span>
                )}
              </div>
              <div className="flex h-3 rounded-full overflow-hidden gap-px">
                {entregados > 0 && (
                  <div className="bg-green-500 transition-all" style={{ width: `${(entregados / total) * 100}%` }} title={`Entregados: ${entregados}`} />
                )}
                {fallidos > 0 && (
                  <div className="bg-red-500 transition-all" style={{ width: `${(fallidos / total) * 100}%` }} title={`Fallidos: ${fallidos}`} />
                )}
                {pendientes > 0 && (
                  <div className="bg-yellow-400 transition-all" style={{ width: `${(pendientes / total) * 100}%` }} title={`Pendientes: ${pendientes}`} />
                )}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Entregado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Fallido/Rechazado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Pendiente</span>
              </div>
            </Card>
          )}

          {/* Tabla */}
          {fetched && (
            <Card variant="elevated" className="overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-gray-900 dark:text-white text-sm">Detalle de mensajes</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">
                    SMS Masivos
                  </span>
                  {filtered.length !== total && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">{filtered.length} de {total}</span>
                  )}
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Buscar número o mensaje..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400 w-52" />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400 dark:text-gray-500">
                  <MessageSquare size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Sin resultados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Número</th>
                        <th className="px-4 py-3 text-left">Mensaje</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                        <th className="px-4 py-3 text-left">Fecha de envío</th>
                        <th className="px-4 py-3 text-left">Referencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {filtered.map((row, i) => {
                        const st = STATUS_MAP[row.status] ?? { label: `Estado ${row.status}`, bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', icon: <Filter size={12} /> }
                        return (
                          <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                            <td className="px-4 py-3 font-mono text-gray-900 dark:text-white text-xs whitespace-nowrap">
                              +52 {row.number}
                            </td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs">
                              <p className="truncate">{row.message}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                                {st.icon} {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                              {row.sent_date ? formatDate(row.sent_date) : '—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                              {row.reference || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {!fetched && !loading && (
            <div className="py-20 text-center text-gray-400 dark:text-gray-500">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">Selecciona un rango de fechas y pulsa <strong>Consultar reporte</strong></p>
              <p className="text-xs mt-1 opacity-70">Datos en tiempo real desde SMS Masivos</p>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
