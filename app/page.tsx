'use client'

import { useEffect, useState } from 'react'
import { getDashboardMetrics, getContacts, getAllReminders } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import { Users, MessageSquare, TrendingUp, Clock, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Dashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [recentContacts, setRecentContacts] = useState<any[]>([])
  const [pendingReminders, setPendingReminders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getDashboardMetrics(), getContacts(), getAllReminders()])
      .then(([m, contacts, reminders]) => {
        setMetrics(m)
        setRecentContacts(contacts.slice(0, 5))
        setPendingReminders(reminders.filter((r: any) => !r.is_completed).slice(0, 5))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const metricCards = [
    { title: 'Total Contactos', value: metrics?.totalContacts ?? 0, icon: Users, cardClass: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800', iconClass: 'text-blue-700 dark:text-blue-300', textClass: 'text-blue-900 dark:text-blue-100' },
    { title: 'Recordatorios Pendientes', value: metrics?.pendingReminders ?? 0, icon: Clock, cardClass: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800', iconClass: 'text-amber-700 dark:text-amber-300', textClass: 'text-amber-900 dark:text-amber-100' },
    { title: 'Mensajes Enviados', value: metrics?.totalMessagesSent ?? 0, icon: MessageSquare, cardClass: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800', iconClass: 'text-green-700 dark:text-green-300', textClass: 'text-green-900 dark:text-green-100' },
    { title: 'Tasa de Conversión', value: `${metrics?.conversionRate ?? 0}%`, icon: TrendingUp, cardClass: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800', iconClass: 'text-red-700 dark:text-red-300', textClass: 'text-red-900 dark:text-red-100' },
  ]

  return (
    <>
      <Navbar />
      <div className="min-h-screen py-6 sm:py-8 bg-gray-50 dark:bg-gray-900 dark-mode-transition">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <div className="mb-8 animate-page-in">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Dashboard IPESA</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Gestión inteligente de prospectos y campañas comerciales</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600" />
            </div>
          ) : (
            <>
              {/* Métricas */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8 animate-stagger">
                {metricCards.map((m, i) => {
                  const Icon = m.icon
                  return (
                    <div key={i} className={`rounded-xl shadow border p-4 sm:p-6 dark-mode-transition hover-lift ${m.cardClass}`}>
                      <div className="flex justify-between items-start mb-3 sm:mb-4">
                        <div className="p-2 sm:p-3 rounded-lg bg-white/60 dark:bg-white/10">
                          <Icon size={20} className={m.iconClass} />
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm font-medium mb-1">{m.title}</p>
                      <p className={`text-2xl sm:text-3xl font-bold ${m.textClass}`}>{m.value}</p>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Contactos recientes */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
                      <Users size={18} className="text-blue-600" /> Contactos Recientes
                    </h2>
                    <Link href="/contactos" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      Ver todos <ArrowRight size={14} />
                    </Link>
                  </div>
                  {recentContacts.length === 0 ? (
                    <p className="p-6 text-center text-gray-400">No hay contactos aún</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {recentContacts.map(c => (
                        <div key={c.id} className="px-4 sm:px-6 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 dark-mode-transition">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}{c.company ? ` · ${c.company}` : ''}</p>
                          </div>
                          <Badge variant={c.prospect_status === 'cliente' ? 'success' : c.prospect_status === 'rechazado' ? 'danger' : 'info'}>
                            {c.prospect_status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Recordatorios pendientes */}
                <Card variant="elevated" className="overflow-hidden">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm sm:text-base">
                      <Clock size={18} className="text-amber-600" /> Recordatorios Pendientes
                    </h2>
                    <Link href="/recordatorios" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      Ver todos <ArrowRight size={14} />
                    </Link>
                  </div>
                  {pendingReminders.length === 0 ? (
                    <p className="p-6 text-center text-gray-400">No hay recordatorios pendientes</p>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-800">
                      {pendingReminders.map(r => (
                        <div key={r.id} className="px-4 sm:px-6 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800 dark-mode-transition">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{r.contacts?.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{r.reminder_type}</p>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
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
