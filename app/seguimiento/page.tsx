'use client'

import { useEffect, useState } from 'react'
import {
  getFollowUpPendingActions, getDashboardFollowUpStats,
  completeFollowUp, addContactNote, getFollowUpSequences, createFollowUpPlan, getContacts,
  getAllFollowUpPlans, deleteFollowUpPlan, getPrimerContactoPendientes, markFirstContact,
  createReminder,
} from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import FollowUpTemplateSelector from '@/components/FollowUpTemplateSelector'
import toast from 'react-hot-toast'
import React from 'react'
import { Phone, MessageCircle, Mail, CheckCircle, Clock, TrendingUp, Zap, Plus, User, ChevronDown, ChevronRight, Trash2, Search, X, Bell } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'

const CHANNEL_ICONS: Record<string, React.ReactElement> = {
  whatsapp: <MessageCircle size={16} className="text-green-600" />,
  call: <Phone size={16} className="text-blue-600" />,
  email: <Mail size={16} className="text-purple-600" />,
}

const TONE_BADGE: Record<string, any> = {
  confirmacion: 'info', validacion: 'warning', valor: 'success',
  empuje: 'danger', recordatorio: 'warning', cierre: 'danger',
}

const TONE_COLOR: Record<string, string> = {
  confirmacion: '#3b82f6',
  validacion: '#f59e0b',
  valor: '#10b981',
  empuje: '#ef4444',
  recordatorio: '#f59e0b',
  cierre: '#ef4444',
}

type Tab = 'primer_contacto' | 'pendientes' | 'planes'

function groupByPlan(allFollowUps: any[], sequences: any[]) {
  const seqMap = new Map(sequences.map(s => [s.id, s.name]))
  const map = new Map<string, any>()
  for (const fu of allFollowUps) {
    const key = `${fu.contact_id}__${fu.sequence_id}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        contact: fu.contacts,
        sequenceName: seqMap.get(fu.sequence_id) || 'Secuencia',
        stages: [],
      })
    }
    map.get(key).stages.push(fu)
  }
  return Array.from(map.values())
}

export default function Seguimiento() {
  const [actions, setActions] = useState<any[]>([])
  const [allPlans, setAllPlans] = useState<any[]>([])
  const [primerContacto, setPrimerContacto] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [sequences, setSequences] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<any>(null)
  const [newPlanModal, setNewPlanModal] = useState(false)
  const [responseStatus, setResponseStatus] = useState('interested')
  const [responseNote, setResponseNote] = useState('')
  const [planForm, setPlanForm] = useState({ contact_id: '', sequence_id: '' })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('primer_contacto')
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set())
  const [firstContactModal, setFirstContactModal] = useState<any>(null)
  const [fcChannel, setFcChannel] = useState('whatsapp')
  const [fcResponse, setFcResponse] = useState('interested')
  const [fcNote, setFcNote] = useState('')
  const [primerContactoSearch, setPrimerContactoSearch] = useState('')
  const [reminderModal, setReminderModal] = useState<{ contact_id: string; contact_name: string; follow_up_id: string; suggested_date: string } | null>(null)
  const [reminderDate, setReminderDate] = useState('')
  const [reminderNote, setReminderNote] = useState('')
  const [reminderSaving, setReminderSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    try {
      setLoading(true)
      const [a, s, seqs, c, allFu, pc] = await Promise.all([
        getFollowUpPendingActions(),
        getDashboardFollowUpStats(),
        getFollowUpSequences(),
        getContacts(),
        getAllFollowUpPlans(),
        getPrimerContactoPendientes(),
      ])
      setActions(a)
      setStats(s)
      setSequences(seqs)
      setContacts(c)
      setAllPlans(groupByPlan(allFu, seqs))
      setPrimerContacto(pc)
    } catch { toast.error('Error al cargar datos') }
    finally { setLoading(false) }
  }

  const handleComplete = async () => {
    if (!modal) return
    try {
      setSaving(true)
      await completeFollowUp(modal.id, responseStatus, responseNote)
      if (responseNote) await addContactNote(modal.contact_id, 'accion', responseNote)
      toast.success('Seguimiento completado')
      setModal(null)
      setResponseNote('')
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(false) }
  }

  const handleNewPlan = async () => {
    if (!planForm.contact_id) { toast.error('Selecciona un contacto'); return }
    const defaultSeq = sequences[0]
    if (!defaultSeq) { toast.error('No hay secuencia configurada'); return }
    try {
      setSaving(true)
      await createFollowUpPlan(planForm.contact_id, defaultSeq.id)
      toast.success('Plan de seguimiento creado')
      setNewPlanModal(false)
      setPlanForm({ contact_id: '', sequence_id: '' })
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(false) }
  }

  const openReminderModal = (action: any) => {
    // Sugerir fecha/hora actual + 1 hora como default
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setReminderDate(local)
    setReminderNote('')
    setReminderModal({
      contact_id: action.contact_id,
      contact_name: action.contacts?.name || '',
      follow_up_id: action.id,
      suggested_date: local,
    })
  }

  const handleCreateReminder = async () => {
    if (!reminderModal || !reminderDate) return
    try {
      setReminderSaving(true)
      await createReminder({
        contact_id: reminderModal.contact_id,
        reminder_date: new Date(reminderDate).toISOString(),
        reminder_type: 'follow_up',
        notes: reminderNote || `Seguimiento — ${reminderModal.contact_name}`,
      })
      toast.success(`Recordatorio creado para ${reminderModal.contact_name}`)
      setReminderModal(null)
    } catch (error: any) { toast.error(error.message) }
    finally { setReminderSaving(false) }
  }

  const togglePlan = (key: string) => {
    setExpandedPlans(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleDeletePlan = async (contactId: string, sequenceId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('¿Eliminar este plan de seguimiento? Se borrarán todas sus etapas.')) return
    try {
      await deleteFollowUpPlan(contactId, sequenceId)
      toast.success('Plan eliminado')
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
  }

  const whatsappUrl = (phone: string, message?: string) => {
    const digits = phone.replace(/\D/g, '')
    const full = digits.startsWith('52') ? digits : `521${digits}`
    const base = `https://wa.me/${full}`
    return message ? `${base}?text=${encodeURIComponent(message)}` : base
  }

  const handleFirstContact = async () => {
    if (!firstContactModal) return
    try {
      setSaving(true)
      const defaultSeq = sequences[0]
      await markFirstContact(firstContactModal.id, fcChannel, fcResponse, fcNote, defaultSeq?.id)
      const autoCreated = fcResponse === 'interested' || fcResponse === 'maybe'
      toast.success(autoCreated ? 'Contacto registrado — plan de seguimiento creado automáticamente' : 'Contacto registrado')
      setFirstContactModal(null)
      setFcNote('')
      setFcChannel('whatsapp')
      setFcResponse('interested')
      fetchAll()
    } catch (error: any) { toast.error(error.message) }
    finally { setSaving(false) }
  }

  const statCards = stats ? [
    { title: 'Sin Contactar', value: primerContacto.length, icon: User, cardClass: 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800', iconClass: 'text-amber-700 dark:text-amber-400', textClass: 'text-gray-900 dark:text-white' },
    { title: 'Acciones Pendientes', value: stats.pendingActions, icon: Clock, cardClass: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800', iconClass: 'text-orange-600 dark:text-orange-400', textClass: 'text-gray-900 dark:text-white' },
    { title: 'Leads Interesados', value: stats.interestedLeads, icon: TrendingUp, cardClass: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800', iconClass: 'text-blue-700 dark:text-blue-300', textClass: 'text-gray-900 dark:text-white' },
    { title: 'Completados', value: stats.completedFollowUps, icon: CheckCircle, cardClass: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800', iconClass: 'text-green-700 dark:text-green-300', textClass: 'text-gray-900 dark:text-white' },
  ] : []

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">

          <div className="flex flex-wrap gap-3 justify-between items-start mb-6 sm:mb-8">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Sistema de Seguimiento</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Motor de seguimiento comercial — 6 intentos en 12 días</p>
            </div>
            <Button variant="primary" onClick={() => setNewPlanModal(true)}>
              <Plus size={18} /> Nuevo Plan
            </Button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
              {statCards.map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={i} className={`rounded-xl shadow border p-4 sm:p-5 dark-mode-transition ${s.cardClass}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="p-2 rounded-lg bg-white/70 dark:bg-white/10 shadow-sm">
                        <Icon size={20} className={s.iconClass} />
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 text-xs font-medium mb-1">{s.title}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${s.textClass}`}>{s.value}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white dark:bg-gray-800 rounded-xl p-1 shadow border border-gray-100 dark:border-gray-700 w-fit max-w-full overflow-x-auto dark-mode-transition">
            {([
              { key: 'primer_contacto', label: 'Primer Contacto', count: primerContacto.length },
              { key: 'pendientes', label: 'Pendientes', count: actions.length },
              { key: 'planes', label: 'Planes', count: allPlans.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                  tab === t.key
                    ? 'bg-primary-700 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${
                    tab === t.key
                      ? 'bg-white/25 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : tab === 'primer_contacto' ? (
            // ── TAB PRIMER CONTACTO ──
            primerContacto.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle size={48} className="text-green-300 dark:text-green-700 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-gray-500 text-lg">Sin prospectos nuevos</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Todos los contactos han sido abordados</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* Search bar */}
                <div className="relative mb-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar nombre, empresa, teléfono..."
                    value={primerContactoSearch}
                    onChange={e => setPrimerContactoSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                  />
                  {primerContactoSearch && (
                    <button onClick={() => setPrimerContactoSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {primerContacto.filter(c => {
                    if (!primerContactoSearch) return true
                    const q = primerContactoSearch.toLowerCase()
                    return c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.phone?.includes(q)
                  }).length} de {primerContacto.length} prospecto{primerContacto.length !== 1 ? 's' : ''} sin contactar
                </p>
                {primerContacto.filter(contact => {
                  if (!primerContactoSearch) return true
                  const q = primerContactoSearch.toLowerCase()
                  return contact.name?.toLowerCase().includes(q) || contact.company?.toLowerCase().includes(q) || contact.phone?.includes(q)
                }).map(contact => (
                  <Card key={contact.id} variant="elevated" className="p-4 sm:p-5 hover:shadow-lg transition duration-200">
                    <div className="flex flex-wrap sm:flex-nowrap justify-between items-start gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                            <User size={16} className="text-gray-400" />
                            {contact.name}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-amber-800 dark:text-amber-300">
                            Nuevo
                          </span>
                          {contact.segment && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-medium capitalize">
                              {contact.segment}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{contact.company}{contact.address ? ` · ${contact.address}` : ''}</p>
                        <p className="text-gray-700 dark:text-gray-300 text-sm font-medium mt-1">{contact.phone}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <a
                          href={whatsappUrl(contact.phone || '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition"
                        >
                          <MessageCircle size={15} /> WhatsApp
                        </a>
                        <a
                          href={`tel:${contact.phone}`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
                        >
                          <Phone size={15} /> Llamar
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setFirstContactModal(contact); setFcChannel('whatsapp'); setFcResponse('interested'); setFcNote('') }}
                        >
                          Documentar
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : tab === 'pendientes' ? (
            // ── TAB ACCIONES PENDIENTES ──
            actions.length === 0 ? (
              <Card className="p-12 text-center">
                <CheckCircle size={48} className="text-green-300 dark:text-green-700 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-gray-500 text-lg">No hay acciones pendientes</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Crea un nuevo plan de seguimiento para comenzar</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {actions.map(action => (
                  <Card key={action.id} variant="elevated" className="p-4 sm:p-5 hover:shadow-lg transition duration-200">
                    <div className="flex flex-wrap sm:flex-nowrap justify-between items-start gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                            <User size={16} className="text-gray-400" />
                            {action.contacts?.name}
                          </div>
                          <Badge variant={TONE_BADGE[action.follow_up_stages?.tone] || 'default'}>
                            {action.follow_up_stages?.stage_name}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            {CHANNEL_ICONS[action.follow_up_stages?.channel] || <Zap size={16} />}
                            <span className="capitalize">{action.follow_up_stages?.channel}</span>
                          </div>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{action.contacts?.company} · {action.contacts?.phone}</p>
                        <p className="text-gray-700 dark:text-gray-300 text-sm mt-2">
                          <span className="font-semibold">Objetivo:</span> {action.follow_up_stages?.objective}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {formatDistanceToNow(new Date(action.scheduled_date), { locale: es, addSuffix: true })}
                          {' · '}{format(new Date(action.scheduled_date), "d 'de' MMM", { locale: es })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openReminderModal(action)} title="Crear recordatorio para esta etapa">
                          <Bell size={14} /> Recordar
                        </Button>
                        <Button variant="primary" size="sm" onClick={() => { setModal(action); setResponseStatus('interested'); setResponseNote('') }}>
                          Ejecutar
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            // ── TAB TODOS LOS PLANES ──
            allPlans.length === 0 ? (
              <Card className="p-12 text-center">
                <Zap size={48} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-gray-500 text-lg">No hay planes creados</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Crea un nuevo plan para asignar una secuencia a un contacto</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {allPlans.map(plan => {
                  const completed = plan.stages.filter((s: any) => s.status === 'completed').length
                  const total = plan.stages.length
                  const pct = Math.round((completed / total) * 100)
                  const isExpanded = expandedPlans.has(plan.key)
                  const nextPending = plan.stages.find((s: any) => s.status === 'pending')

                  return (
                    <Card key={plan.key} variant="elevated" className="overflow-hidden">
                      {/* Header */}
                      <div
                        className="w-full p-4 sm:p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition text-left cursor-pointer dark-mode-transition"
                        onClick={() => togglePlan(plan.key)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <User size={16} className="text-gray-400 flex-shrink-0" />
                            <span className="font-bold text-gray-900 dark:text-white">{plan.contact?.name}</span>
                            <span className="text-gray-400 text-sm hidden sm:inline">·</span>
                            <span className="text-gray-500 dark:text-gray-400 text-sm hidden sm:inline">{plan.contact?.company}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              {plan.sequenceName}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <div className="flex-1 min-w-[80px] max-w-xs h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : '#0369a1' }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{completed}/{total}</span>
                            {nextPending && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
                                Próximo: {format(new Date(nextPending.scheduled_date), "d MMM", { locale: es })}
                              </span>
                            )}
                            {pct === 100 && (
                              <span className="text-xs font-semibold text-green-600 dark:text-green-400">✓ Completado</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <a
                            href={whatsappUrl(plan.contact?.phone || '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Abrir WhatsApp"
                            className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition"
                          >
                            <MessageCircle size={18} className="text-green-600 dark:text-green-400" />
                          </a>
                          <button
                            onClick={e => handleDeletePlan(plan.contact?.id, plan.stages[0]?.sequence_id, e)}
                            title="Eliminar plan"
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                          >
                            <Trash2 size={18} className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400" />
                          </button>
                          <div className="text-gray-400 dark:text-gray-500">
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </div>
                        </div>
                      </div>

                      {/* Stages detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50">
                          {plan.stages.map((stage: any, idx: number) => {
                            const isPending = stage.status === 'pending'
                            const isOverdue = isPending && new Date(stage.scheduled_date) <= new Date()
                            return (
                              <div key={stage.id} className={`px-4 sm:px-5 py-3 flex items-start gap-3 sm:gap-4 ${stage.status === 'completed' ? 'opacity-60' : ''}`}>
                                {/* Step number */}
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                                  stage.status === 'completed'
                                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                    : isOverdue
                                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                }`}>
                                  {stage.status === 'completed' ? '✓' : idx + 1}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{stage.follow_up_stages?.stage_name}</span>
                                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                      {CHANNEL_ICONS[stage.follow_up_stages?.channel] || <Zap size={14} />}
                                      <span className="capitalize">{stage.follow_up_stages?.channel}</span>
                                    </div>
                                    <span
                                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                                      style={{
                                        backgroundColor: TONE_COLOR[stage.follow_up_stages?.tone] + '20',
                                        color: TONE_COLOR[stage.follow_up_stages?.tone] || '#6b7280',
                                      }}
                                    >
                                      {stage.follow_up_stages?.tone}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stage.follow_up_stages?.objective}</p>
                                  {stage.notes && (
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">"{stage.notes}"</p>
                                  )}
                                </div>

                                <div className="text-right flex-shrink-0">
                                  <p className="text-xs text-gray-400 dark:text-gray-500">{format(new Date(stage.scheduled_date), "d MMM", { locale: es })}</p>
                                  {isOverdue && (
                                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">Vencido</span>
                                  )}
                                  {stage.status === 'pending' && !isOverdue && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">Programado</span>
                                  )}
                                  {stage.status === 'completed' && stage.response_status && (
                                    <span className="text-xs text-green-600 dark:text-green-400">{stage.response_status}</span>
                                  )}
                                </div>

                                {isOverdue && (
                                  <div className="flex gap-2">
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => { setModal(stage); setResponseStatus('interested'); setResponseNote(''); setTab('pendientes') }}
                                  >
                                    Ejecutar
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openReminderModal(stage)}
                                    title="Crear recordatorio"
                                  >
                                    <Bell size={14} />
                                  </Button>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>

      {/* Modal ejecutar acción */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto dark-mode-transition">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ejecutar Seguimiento</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {modal.contacts?.name} · {modal.follow_up_stages?.stage_name}
              </p>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              <FollowUpTemplateSelector
                stage={modal.follow_up_stages?.tone || ''}
                channel={modal.follow_up_stages?.channel || ''}
                contact={modal.contacts}
              />
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Respuesta del contacto</label>
                <select
                  value={responseStatus}
                  onChange={e => setResponseStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                >
                  <option value="interested">Muy interesado</option>
                  <option value="maybe">Posiblemente interesado</option>
                  <option value="no_response">Sin respuesta</option>
                  <option value="cold">Desinteresado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notas internas</label>
                <textarea
                  value={responseNote}
                  onChange={e => setResponseNote(e.target.value)}
                  placeholder="Ej: Preguntó por descuento en cantidad, llamar el viernes..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 h-24 resize-none dark-mode-transition"
                />
              </div>
            </div>
            <div className="p-5 sm:p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3 justify-between items-center flex-wrap">
              <div>
                {modal.follow_up_stages?.channel === 'whatsapp' && modal.contacts?.phone && (
                  <a
                    href={whatsappUrl(modal.contacts.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition"
                  >
                    <MessageCircle size={16} /> Abrir WhatsApp
                  </a>
                )}
                {modal.follow_up_stages?.channel === 'call' && modal.contacts?.phone && (
                  <a
                    href={`tel:${modal.contacts.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
                  >
                    <Phone size={16} /> Llamar
                  </a>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
                <Button variant="primary" loading={saving} onClick={handleComplete}>
                  <CheckCircle size={16} /> Marcar Completo
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal primer contacto */}
      {firstContactModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto dark-mode-transition">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Documentar Primer Contacto</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{firstContactModal.name} · {firstContactModal.phone}</p>
            </div>
            <div className="p-5 sm:p-6 space-y-4">

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Canal utilizado</label>
                <div className="flex gap-2">
                  {[
                    { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={15} />, color: '#16a34a' },
                    { value: 'call', label: 'Llamada', icon: <Phone size={15} />, color: '#2563eb' },
                    { value: 'email', label: 'Email', icon: <Mail size={15} />, color: '#7c3aed' },
                  ].map(ch => (
                    <button
                      key={ch.value}
                      onClick={() => setFcChannel(ch.value)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold border-2 transition"
                      style={{
                        borderColor: fcChannel === ch.value ? ch.color : '#e5e7eb',
                        backgroundColor: fcChannel === ch.value ? ch.color + '15' : 'transparent',
                        color: fcChannel === ch.value ? ch.color : '#6b7280',
                      }}
                    >
                      {ch.icon} {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Respuesta del prospecto</label>
                <div className="space-y-2">
                  {[
                    { value: 'interested', label: 'Muy interesado', sub: 'Se creará plan de seguimiento automáticamente', colorClass: 'text-green-700 dark:text-green-400', activeBorder: '#15803d', activeBg: '#f0fdf4' },
                    { value: 'maybe', label: 'Posiblemente interesado', sub: 'Se creará plan de seguimiento automáticamente', colorClass: 'text-amber-700 dark:text-amber-400', activeBorder: '#b45309', activeBg: '#fffbeb' },
                    { value: 'no_response', label: 'Sin respuesta', sub: 'Se marca como contactado, sin plan aún', colorClass: 'text-gray-600 dark:text-gray-400', activeBorder: '#6b7280', activeBg: '#f9fafb' },
                    { value: 'cold', label: 'No le interesa / Rechazó', sub: 'Se descarta el prospecto', colorClass: 'text-red-600 dark:text-red-400', activeBorder: '#dc2626', activeBg: '#fef2f2' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFcResponse(opt.value)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition dark:border-gray-600 ${
                        fcResponse === opt.value ? 'border-current' : 'hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                      style={fcResponse === opt.value ? { borderColor: opt.activeBorder, backgroundColor: opt.activeBg } : {}}
                    >
                      <p className={`text-sm font-semibold ${opt.colorClass}`}>{opt.label}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Notas de la conversación</label>
                <textarea
                  value={fcNote}
                  onChange={e => setFcNote(e.target.value)}
                  placeholder="Ej: Preguntó por precios al mayoreo, llamar la próxima semana..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 h-20 resize-none text-sm dark-mode-transition"
                />
              </div>
            </div>
            <div className="p-5 sm:p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setFirstContactModal(null)}>Cancelar</Button>
              <Button variant="primary" loading={saving} onClick={handleFirstContact}>
                <CheckCircle size={16} /> Registrar Contacto
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo plan */}
      {newPlanModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md dark-mode-transition">
            <div className="p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nuevo Plan de Seguimiento</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Asigna una secuencia automática a un contacto</p>
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Contacto</label>
                <select
                  value={planForm.contact_id}
                  onChange={e => setPlanForm({ ...planForm, contact_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                >
                  <option value="">Seleccionar contacto...</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-5 sm:p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setNewPlanModal(false)}>Cancelar</Button>
              <Button variant="primary" loading={saving} onClick={handleNewPlan}>
                <Plus size={16} /> Crear Plan
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Crear recordatorio rápido */}
      {reminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setReminderModal(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                <Bell size={20} className="text-orange-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Crear recordatorio</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{reminderModal.contact_name}</p>
              </div>
              <button onClick={() => setReminderModal(null)} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha y hora</label>
                <input
                  type="datetime-local"
                  value={reminderDate}
                  onChange={e => setReminderDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nota (opcional)</label>
                <input
                  placeholder={`Seguimiento — ${reminderModal.contact_name}`}
                  value={reminderNote}
                  onChange={e => setReminderNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent placeholder-gray-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleCreateReminder}
                disabled={reminderSaving || !reminderDate}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition flex items-center justify-center gap-2"
              >
                <Bell size={15} /> {reminderSaving ? 'Guardando...' : 'Crear recordatorio'}
              </button>
              <button
                onClick={() => setReminderModal(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-semibold transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
