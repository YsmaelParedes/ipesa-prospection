'use client'

import { useEffect, useState, useMemo } from 'react'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { MessageSquare, CheckCircle, Eye, XCircle, Clock, RefreshCw, Search, ChevronDown } from 'lucide-react'

interface MessageLog {
  id: string
  message_sid: string
  contact_name: string
  contact_phone: string
  template_name: string
  status: string
  error_code: string | null
  error_message: string | null
  sent_at: string
  delivered_at: string | null
  read_at: string | null
  scheduled_for: string | null
}

const STATUS_COLORS: Record<string, string> = {
  queued:      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  scheduled:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  sent:        'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  delivered:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  read:        'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
  failed:      'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  undelivered: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
}

const STATUS_LABELS: Record<string, string> = {
  queued:      'En cola',
  scheduled:   'Programado',
  sent:        'Enviado',
  delivered:   'Entregado',
  read:        'Leído',
  failed:      'Fallido',
  undelivered: 'No entregado',
}

const STATUS_ICONS: Record<string, JSX.Element> = {
  queued:      <Clock size={12} />,
  scheduled:   <Clock size={12} />,
  sent:        <CheckCircle size={12} />,
  delivered:   <CheckCircle size={12} />,
  read:        <Eye size={12} />,
  failed:      <XCircle size={12} />,
  undelivered: <XCircle size={12} />,
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ReportesWhatsApp() {
  const [messages, setMessages]     = useState<MessageLog[]>([])
  const [loading, setLoading]       = useState(true)
  const [filterStatus, setFilter]   = useState('')
  const [search, setSearch]         = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchMessages = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus) params.set('status', filterStatus)
      const res  = await fetch(`/api/twilio/messages?${params}`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch {}
    finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { fetchMessages() }, [filterStatus])

  // Auto-refresh cada 30s
  useEffect(() => {
    const id = setInterval(() => fetchMessages(), 30_000)
    return () => clearInterval(id)
  }, [filterStatus])

  const filtered = useMemo(() => {
    if (!search) return messages
    const q = search.toLowerCase()
    return messages.filter(m =>
      m.contact_name.toLowerCase().includes(q) ||
      m.contact_phone.includes(q) ||
      m.template_name.toLowerCase().includes(q)
    )
  }, [messages, search])

  // Estadísticas
  const stats = useMemo(() => {
    const total     = messages.length
    const delivered = messages.filter(m => m.status === 'delivered' || m.status === 'read').length
    const read      = messages.filter(m => m.status === 'read').length
    const failed    = messages.filter(m => m.status === 'failed' || m.status === 'undelivered').length
    return { total, delivered, read, failed }
  }, [messages])

  const FILTERS = [
    { value: '', label: 'Todos' },
    { value: 'queued',      label: 'En cola' },
    { value: 'sent',        label: 'Enviados' },
    { value: 'delivered',   label: 'Entregados' },
    { value: 'read',        label: 'Leídos' },
    { value: 'failed',      label: 'Fallidos' },
    { value: 'undelivered', label: 'No entregados' },
    { value: 'scheduled',   label: 'Programados' },
  ]

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-6xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Reportes WhatsApp</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Historial y estado de mensajes enviados via Twilio</p>
            </div>
            <Button variant="secondary" onClick={() => fetchMessages(true)} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Actualizar
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total enviados', value: stats.total,     color: 'text-gray-900 dark:text-white',               icon: <MessageSquare size={18} className="text-gray-400" /> },
              { label: 'Entregados',     value: stats.delivered, color: 'text-green-600 dark:text-green-400',           icon: <CheckCircle size={18} className="text-green-400" /> },
              { label: 'Leídos',         value: stats.read,      color: 'text-primary-600 dark:text-primary-400',       icon: <Eye size={18} className="text-primary-400" /> },
              { label: 'Fallidos',       value: stats.failed,    color: 'text-red-600 dark:text-red-400',               icon: <XCircle size={18} className="text-red-400" /> },
            ].map(s => (
              <Card key={s.label} variant="elevated" className="p-4">
                <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-gray-500 dark:text-gray-400">{s.label}</span></div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                {s.label !== 'Total enviados' && stats.total > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">{((s.value / stats.total) * 100).toFixed(1)}%</p>
                )}
              </Card>
            ))}
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mb-4">
            {FILTERS.map(f => (
              <button key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterStatus === f.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-primary-400'
                }`}
              >
                {f.label}
              </button>
            ))}

            {/* Búsqueda */}
            <div className="ml-auto relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar contacto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
              />
            </div>
          </div>

          {/* Tabla */}
          <Card variant="elevated" className="overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">Cargando mensajes...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400 dark:text-gray-500">
                <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay mensajes{filterStatus ? ` con estado "${STATUS_LABELS[filterStatus]}"` : ''}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      {['Contacto', 'Plantilla', 'Estado', 'Enviado', 'Entregado', 'Leído', 'Error'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {filtered.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white truncate max-w-[140px]">{m.contact_name || '—'}</p>
                          <p className="text-xs text-gray-400">{m.contact_phone}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{m.template_name || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[m.status] || STATUS_COLORS.queued}`}>
                            {STATUS_ICONS[m.status] || <Clock size={12} />}
                            {STATUS_LABELS[m.status] || m.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(m.sent_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(m.delivered_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(m.read_at)}</td>
                        <td className="px-4 py-3 text-xs text-red-500 dark:text-red-400 max-w-[140px]">
                          {m.error_code ? `[${m.error_code}] ${m.error_message || ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3 text-center">
            Se actualiza automáticamente cada 30 segundos · {filtered.length} mensajes
          </p>
        </div>
      </div>
    </>
  )
}
