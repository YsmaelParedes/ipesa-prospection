'use client'

import { useState, useMemo, useRef } from 'react'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import toast from 'react-hot-toast'
import {
  MessageSquare, Search, RefreshCw, CheckCircle, XCircle, Clock,
  AlertTriangle, BarChart3, Send, TrendingUp, Download, RotateCcw,
  ChevronDown, X,
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

type TabId = 'all' | 'delivered' | 'failed' | 'pending'
const TABS: { id: TabId; label: string; statuses: number[] }[] = [
  { id: 'all',       label: 'Todos',      statuses: [] },
  { id: 'delivered', label: 'Entregados', statuses: [1] },
  { id: 'failed',    label: 'Fallidos',   statuses: [2, 4, 5] },
  { id: 'pending',   label: 'Pendientes', statuses: [3] },
]

function formatDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toApiDate(date: string, endOfDay = false) {
  return `${date} ${endOfDay ? '23:59:59' : '00:00:00'}`
}

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}

// ── CSV export ──────────────────────────────────────────────────────────────
function downloadCSV(rows: SmsReport[], filename: string) {
  const header = ['Número', 'Mensaje', 'Estado', 'Fecha envío', 'Referencia']
  const lines = rows.map(r => [
    `+52${r.number}`,
    `"${(r.message || '').replace(/"/g, '""')}"`,
    STATUS_MAP[r.status]?.label ?? `Estado ${r.status}`,
    r.sent_date ? formatDate(r.sent_date) : '',
    r.reference,
  ].join(','))
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function SmsReportes() {
  // ── Fetch ───────────────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(daysAgoStr(7))
  const [endDate,   setEndDate]   = useState(todayStr())
  const [report,    setReport]    = useState<SmsReport[]>([])
  const [loading,   setLoading]   = useState(false)
  const [fetched,   setFetched]   = useState(false)

  // ── Filtros UI ──────────────────────────────────────────────────────────
  const [tab,    setTab]    = useState<TabId>('all')
  const [search, setSearch] = useState('')

  // ── Selección para re-envío ─────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set()) // key = index string
  const [resending, setResending] = useState(false)
  const [resendProgress, setResendProgress] = useState(0)

  // ── Modal re-envío entregado ────────────────────────────────────────────
  const [confirmRow, setConfirmRow] = useState<SmsReport | null>(null)

  // ── Download dropdown ───────────────────────────────────────────────────
  const [dlOpen, setDlOpen] = useState(false)
  const dlRef = useRef<HTMLDivElement>(null)

  const fetchReport = async () => {
    setLoading(true); setSelected(new Set())
    try {
      const res  = await fetch('/api/sms-masivos/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: toApiDate(startDate), end_date: toApiDate(endDate, true) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReport(data.report || [])
      setFetched(true)
      setTab('all')
      if (!(data.report || []).length) toast('Sin registros en ese período', { icon: '📭' })
    } catch (err: any) {
      toast.error('Error al obtener reporte: ' + err.message)
    } finally { setLoading(false) }
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  const total      = report.length
  const entregados = report.filter(r => r.status === 1).length
  const fallidos   = report.filter(r => [2, 4, 5].includes(r.status)).length
  const pendientes = report.filter(r => r.status === 3).length
  const tasa       = total > 0 ? Math.round((entregados / total) * 100) : 0

  // ── Filtrado ────────────────────────────────────────────────────────────
  const tabStatuses = TABS.find(t => t.id === tab)!.statuses
  const filtered = useMemo(() => {
    return report
      .map((r, i) => ({ ...r, _idx: String(i) }))
      .filter(r => {
        if (tabStatuses.length && !tabStatuses.includes(r.status)) return false
        if (search) {
          const q = search.toLowerCase()
          if (!r.number.includes(q) && !r.message.toLowerCase().includes(q) && !r.reference.toLowerCase().includes(q)) return false
        }
        return true
      })
  }, [report, tab, search])

  const tabCount = (t: typeof TABS[0]) =>
    t.statuses.length ? report.filter(r => t.statuses.includes(r.status)).length : total

  // ── Selección ───────────────────────────────────────────────────────────
  const isFailedTab = tab === 'failed'
  const toggleSelect = (key: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const toggleAll = () => {
    const keys = filtered.map(r => r._idx)
    const allSelected = keys.every(k => selected.has(k))
    setSelected(allSelected ? new Set() : new Set(keys))
  }
  const selectedCount = [...selected].filter(k => filtered.some(r => r._idx === k)).length

  // ── Re-envío masivo (fallidos seleccionados) ────────────────────────────
  const resendSelected = async () => {
    const toSend = filtered.filter(r => selected.has(r._idx))
    if (!toSend.length) return
    setResending(true); setResendProgress(0)
    let ok = 0
    for (let i = 0; i < toSend.length; i++) {
      const row = toSend[i]
      try {
        const res = await fetch('/api/twilio/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: row.number, message: row.message }),
        })
        if (res.ok) ok++
      } catch {}
      setResendProgress(Math.round(((i + 1) / toSend.length) * 100))
      if (i < toSend.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    toast.success(`${ok} de ${toSend.length} reenviados`)
    setResending(false); setSelected(new Set())
  }

  // ── Re-envío individual (entregados) ───────────────────────────────────
  const resendSingle = async (row: SmsReport) => {
    try {
      const res = await fetch('/api/twilio/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: row.number, message: row.message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Reenviado a +52${row.number}`)
    } catch (err: any) {
      toast.error('Error: ' + err.message)
    } finally { setConfirmRow(null) }
  }

  // ── Descarga ────────────────────────────────────────────────────────────
  const handleDownload = (mode: 'current' | 'day' | 'month') => {
    setDlOpen(false)
    let rows = filtered
    let name = `sms_reporte_${startDate}_${endDate}.csv`
    if (mode === 'day') {
      const today = todayStr()
      rows = report.filter(r => r.sent_date?.startsWith(today))
        .map((r, i) => ({ ...r, _idx: String(i) }))
      name = `sms_${today}.csv`
    } else if (mode === 'month') {
      const month = todayStr().slice(0, 7)
      rows = report.filter(r => r.sent_date?.startsWith(month))
        .map((r, i) => ({ ...r, _idx: String(i) }))
      name = `sms_${month}.csv`
    }
    if (!rows.length) { toast('Sin datos para exportar', { icon: '📭' }); return }
    downloadCSV(rows, name)
    toast.success(`${rows.length} registros exportados`)
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Reportes SMS</h1>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold border border-red-200 dark:border-red-700">
                  <MessageSquare size={12} /> SMS Masivos
                </span>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Historial, analíticas y re-envío de mensajes</p>
            </div>
          </div>

          {/* Filtros de fecha */}
          <Card variant="elevated" className="p-5 mb-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Desde</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={todayStr()}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[{ label: 'Hoy', days: 0 }, { label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }].map(({ label, days }) => (
                  <button key={label}
                    onClick={() => days === 0 ? (setStartDate(todayStr()), setEndDate(todayStr())) : (setStartDate(daysAgoStr(days)), setEndDate(todayStr()))}
                    className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 transition bg-white dark:bg-gray-700">
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={fetchReport} disabled={loading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-60 transition ml-auto">
                {loading ? <><RefreshCw size={15} className="animate-spin" /> Consultando...</> : <><BarChart3 size={15} /> Consultar</>}
              </button>
            </div>
          </Card>

          {/* Stats */}
          {fetched && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              {[
                { val: total,      label: 'Total',      color: 'text-gray-900 dark:text-white',           icon: <Send size={11} /> },
                { val: entregados, label: 'Entregados', color: 'text-green-700 dark:text-green-300',      icon: <CheckCircle size={11} /> },
                { val: fallidos,   label: 'Fallidos',   color: 'text-red-600 dark:text-red-400',          icon: <XCircle size={11} /> },
                { val: pendientes, label: 'Pendientes', color: 'text-yellow-600 dark:text-yellow-300',    icon: <Clock size={11} /> },
                { val: `${tasa}%`, label: 'Tasa entrega', color: tasa >= 90 ? 'text-green-700 dark:text-green-300' : tasa >= 70 ? 'text-yellow-600 dark:text-yellow-300' : 'text-red-600 dark:text-red-400', icon: <TrendingUp size={11} /> },
              ].map(({ val, label, color, icon }) => (
                <Card key={label} variant="elevated" className="p-4 text-center">
                  <p className={`text-2xl sm:text-3xl font-bold ${color}`}>{typeof val === 'number' ? val.toLocaleString() : val}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center justify-center gap-1">{icon} {label}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Barra visual */}
          {fetched && total > 0 && (
            <Card variant="elevated" className="p-4 mb-5">
              <div className="flex h-3 rounded-full overflow-hidden gap-px mb-2">
                {entregados > 0 && <div className="bg-green-500" style={{ width: `${(entregados / total) * 100}%` }} title={`Entregados: ${entregados}`} />}
                {fallidos   > 0 && <div className="bg-red-500"   style={{ width: `${(fallidos / total) * 100}%` }}   title={`Fallidos: ${fallidos}`} />}
                {pendientes > 0 && <div className="bg-yellow-400" style={{ width: `${(pendientes / total) * 100}%` }} title={`Pendientes: ${pendientes}`} />}
              </div>
              <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Entregado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Fallido</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Pendiente</span>
              </div>
            </Card>
          )}

          {/* Tabla principal */}
          {fetched && (
            <Card variant="elevated" className="overflow-hidden">

              {/* Tabs + acciones */}
              <div className="px-5 pt-4 pb-0 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  {/* Tabs */}
                  <div className="flex gap-1">
                    {TABS.map(t => {
                      const count = tabCount(t)
                      const active = tab === t.id
                      return (
                        <button key={t.id} onClick={() => { setTab(t.id); setSelected(new Set()) }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                            active ? 'bg-red-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}>
                          {t.label}
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Acciones derechas */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Búsqueda */}
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400 w-44" />
                      {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={12} /></button>}
                    </div>

                    {/* Download dropdown */}
                    <div className="relative" ref={dlRef}>
                      <button onClick={() => setDlOpen(!dlOpen)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-gray-700 transition">
                        <Download size={13} /> Exportar <ChevronDown size={11} className={`transition-transform ${dlOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {dlOpen && (
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-20">
                          {[
                            { label: 'Vista actual (filtrada)', mode: 'current' as const },
                            { label: 'Hoy',                     mode: 'day'     as const },
                            { label: 'Este mes',                mode: 'month'   as const },
                          ].map(({ label, mode }) => (
                            <button key={mode} onClick={() => handleDownload(mode)}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-gray-700 hover:text-red-700 dark:hover:text-white transition">
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barra de re-envío masivo (visible cuando hay fallidos seleccionados) */}
                {isFailedTab && selectedCount > 0 && (
                  <div className="flex items-center gap-3 py-2 px-3 mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <span className="text-xs font-semibold text-red-700 dark:text-red-300">{selectedCount} seleccionados</span>
                    <button onClick={() => setSelected(new Set())} className="text-xs text-red-500 hover:text-red-700 transition">Limpiar</button>
                    <button onClick={resendSelected} disabled={resending}
                      className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg disabled:opacity-60 transition">
                      {resending
                        ? <><RefreshCw size={12} className="animate-spin" /> Reenviando {resendProgress}%</>
                        : <><RotateCcw size={12} /> Reenviar {selectedCount}</>
                      }
                    </button>
                  </div>
                )}
              </div>

              {/* Tabla */}
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
                        {isFailedTab && (
                          <th className="px-4 py-3">
                            <input type="checkbox"
                              checked={filtered.length > 0 && filtered.every(r => selected.has(r._idx))}
                              onChange={toggleAll}
                              className="rounded border-gray-300 text-red-600" />
                          </th>
                        )}
                        <th className="px-4 py-3 text-left">Número</th>
                        <th className="px-4 py-3 text-left">Mensaje</th>
                        <th className="px-4 py-3 text-left">Estado</th>
                        <th className="px-4 py-3 text-left">Fecha envío</th>
                        <th className="px-4 py-3 text-left">Referencia</th>
                        <th className="px-4 py-3 text-left">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {filtered.map((row) => {
                        const st = STATUS_MAP[row.status] ?? { label: `Estado ${row.status}`, bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400', icon: null }
                        const isFailed = [2, 4, 5].includes(row.status)
                        const isDelivered = row.status === 1
                        return (
                          <tr key={row._idx} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition ${selected.has(row._idx) ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                            {isFailedTab && (
                              <td className="px-4 py-3">
                                <input type="checkbox" checked={selected.has(row._idx)} onChange={() => toggleSelect(row._idx)}
                                  className="rounded border-gray-300 text-red-600" />
                              </td>
                            )}
                            <td className="px-4 py-3 font-mono text-gray-900 dark:text-white text-xs whitespace-nowrap">+52 {row.number}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs">
                              <p className="truncate">{row.message}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${st.bg} ${st.text}`}>
                                {st.icon} {st.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{formatDate(row.sent_date)}</td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{row.reference || '—'}</td>
                            <td className="px-4 py-3">
                              {isFailed && !isFailedTab && (
                                <button onClick={() => resendSingle(row)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition">
                                  <RotateCcw size={11} /> Reenviar
                                </button>
                              )}
                              {isDelivered && (
                                <button onClick={() => setConfirmRow(row)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition">
                                  <Send size={11} /> Re-contactar
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filtered.length > 0 && (
                <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 flex items-center justify-between">
                  <span>{filtered.length} registros{filtered.length !== total ? ` (de ${total} totales)` : ''}</span>
                  {isFailedTab && <span>{selectedCount} seleccionados</span>}
                </div>
              )}
            </Card>
          )}

          {!fetched && !loading && (
            <div className="py-20 text-center text-gray-400 dark:text-gray-500">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">Selecciona un rango de fechas y pulsa <strong>Consultar</strong></p>
              <p className="text-xs mt-1 opacity-70">Datos en tiempo real desde SMS Masivos</p>
            </div>
          )}

        </div>
      </div>

      {/* ── Modal confirmación re-contactar (entregados) ──────────────────── */}
      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Send size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-sm">Re-contactar número</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">+52 {confirmRow.number}</p>
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                Este número ya recibió este mensaje. Reenviar con poca frecuencia puede marcar el número como spam. Se recomienda esperar al menos 7 días entre mensajes al mismo contacto.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-semibold">Mensaje a reenviar:</p>
              <p className="text-xs text-gray-700 dark:text-gray-200">{confirmRow.message}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setConfirmRow(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                Cancelar
              </button>
              <button onClick={() => resendSingle(confirmRow)}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition">
                Confirmar envío
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
