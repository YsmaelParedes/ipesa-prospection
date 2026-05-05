'use client'

import { useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Link from 'next/link'
import { Users, Clock, TrendingUp, ArrowRight, Tag } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Dashboard() {
  const [data, setData] = useState<any>(null)
  const [recentContacts, setRecentContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/data/dashboard').then(r => r.json()),
      fetch('/api/data/contacts').then(r => r.json()),
    ])
      .then(([dashboard, contacts]) => {
        setData(dashboard)
        setRecentContacts((contacts.contacts || []).slice(0, 5))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const metrics = data?.metrics ?? {}
  const bySegment: any[] = data?.bySegment ?? []
  const byChannel: any[] = data?.byChannel ?? []
  const reminders: any[] = data?.reminders ?? []
  const maxSeg = Math.max(...bySegment.map((s: any) => s.count), 1)
  const maxCh = Math.max(...byChannel.map((c: any) => c.count), 1)

  const statCards = [
    {
      title: 'Total Contactos',
      value: (metrics.totalContacts ?? 0).toLocaleString(),
      icon: Users,
      href: '/contactos',
      cardClass: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
      iconClass: 'text-blue-600 dark:text-blue-400',
      textClass: 'text-blue-900 dark:text-blue-100',
    },
    {
      title: 'Nuevos este mes',
      value: (metrics.newThisMonth ?? 0).toLocaleString(),
      icon: TrendingUp,
      href: '/contactos',
      cardClass: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
      iconClass: 'text-green-600 dark:text-green-400',
      textClass: 'text-green-900 dark:text-green-100',
    },
    {
      title: 'Recordatorios Pendientes',
      value: (metrics.pendingReminders ?? 0).toLocaleString(),
      icon: Clock,
      href: '/recordatorios',
      cardClass: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800',
      iconClass: 'text-amber-600 dark:text-amber-400',
      textClass: 'text-amber-900 dark:text-amber-100',
    },
  ]

  return (
    <>
      <Navbar />
      <div className="min-h-screen py-6 sm:py-8 pb-24 lg:pb-8 bg-gray-50 dark:bg-gray-900 dark-mode-transition">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Dashboard IPESA</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Vista general de prospectos y actividad comercial</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600" />
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 mb-6">
                {statCards.map((m, i) => {
                  const Icon = m.icon
                  return (
                    <Link key={i} href={m.href}
                      className={`rounded-xl border p-4 sm:p-5 flex items-center gap-4 hover:shadow-md transition dark-mode-transition ${m.cardClass}`}>
                      <div className="p-3 rounded-xl bg-white/60 dark:bg-white/10 flex-shrink-0">
                        <Icon size={22} className={m.iconClass} />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{m.title}</p>
                        <p className={`text-2xl sm:text-3xl font-bold ${m.textClass}`}>{m.value}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Breakdowns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

                {/* By segment */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Tag size={16} className="text-purple-500" /> Por segmento
                    </h2>
                    <Link href="/segmentos" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      Gestionar <ArrowRight size={12} />
                    </Link>
                  </div>
                  {bySegment.length === 0 ? (
                    <p className="p-6 text-center text-gray-400 text-sm">Sin segmentos aún</p>
                  ) : (
                    <div className="px-5 py-3 space-y-3">
                      {bySegment.map((s: any) => (
                        <div key={s.name}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color || '#6b7280' }} />
                              {s.name}
                            </span>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{s.count.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(s.count / maxSeg) * 100}%`, background: s.color || '#6b7280' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* By channel */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <TrendingUp size={16} className="text-blue-500" /> Por canal de adquisición
                    </h2>
                  </div>
                  {byChannel.length === 0 ? (
                    <p className="p-6 text-center text-gray-400 text-sm">Sin datos de canal</p>
                  ) : (
                    <div className="px-5 py-3 space-y-3">
                      {byChannel.map((ch: any) => (
                        <div key={ch.name}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ch.name}</span>
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 ml-2 flex-shrink-0">{ch.count.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-blue-400 dark:bg-blue-600 transition-all duration-500"
                              style={{ width: `${(ch.count / maxCh) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Recent contacts + pending reminders */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Recent contacts */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Users size={16} className="text-blue-500" /> Contactos Recientes
                    </h2>
                    <Link href="/contactos" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      Ver todos <ArrowRight size={12} />
                    </Link>
                  </div>
                  {recentContacts.length === 0 ? (
                    <p className="p-6 text-center text-gray-400 text-sm">Sin contactos aún</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {recentContacts.map(c => (
                        <Link key={c.id} href={`/contactos/${c.id}`}
                          className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 dark-mode-transition">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                              {c.name?.charAt(0)?.toUpperCase() ?? '?'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {c.phone}{c.company ? ` · ${c.company}` : ''}
                            </p>
                          </div>
                          {c.segment && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium flex-shrink-0 capitalize">
                              {c.segment}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Pending reminders */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" /> Próximos Recordatorios
                    </h2>
                    <Link href="/recordatorios" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      Ver todos <ArrowRight size={12} />
                    </Link>
                  </div>
                  {reminders.length === 0 ? (
                    <p className="p-6 text-center text-gray-400 text-sm">Sin recordatorios pendientes</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {reminders.map((r: any) => (
                        <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 dark-mode-transition">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{r.contacts?.name ?? '—'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{r.reminder_type}</p>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0">
                            {formatDistanceToNow(new Date(r.reminder_date), { locale: es, addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
