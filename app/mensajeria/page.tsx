'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { getContacts, getSegments } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import {
  Users, MessageSquare, CheckCircle, XCircle, SkipForward, Pause, Play,
  StopCircle, ChevronRight, ChevronLeft, Search, Phone, Zap, Clock,
  AlertTriangle, Eye, Send, MessageCircle, Trash2, Save, Plus, RefreshCw,
} from 'lucide-react'

// ── Tipos ───────────────────────────────────────────────────────────────────
type Channel     = 'whatsapp' | 'sms'
type Step        = 'select' | 'preview' | 'config' | 'sending'
type DelayPreset = 'lento' | 'normal' | 'rapido'

interface LogEntry {
  contactId: string
  name: string
  phone: string
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  error?: string
  sentAt?: Date
}

interface YCloudTemplate {
  name: string
  language: string
  status: string
  components: any[]
}

interface SmsTemplate {
  id: string
  name: string
  content: string
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const DELAY_PRESETS: Record<DelayPreset, { min: number; max: number; label: string; sub: string }> = {
  lento:  { min: 45,  max: 120, label: 'Lento',  sub: '45 – 120 seg · Máxima seguridad' },
  normal: { min: 15,  max: 45,  label: 'Normal',  sub: '15 – 45 seg · Recomendado' },
  rapido: { min: 5,   max: 15,  label: 'Rápido',  sub: '5 – 15 seg · Mayor riesgo' },
}

function gaussianDelay(min: number, max: number): number {
  const u1 = Math.random() || 1e-10
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const mean = (min + max) / 2
  const std  = (max - min) / 4
  return Math.round(Math.max(min, Math.min(max, mean + std * z)) * 1000)
}

function estimatedTime(count: number, preset: DelayPreset): string {
  const { min, max } = DELAY_PRESETS[preset]
  const avgSec = (min + max) / 2 * count
  if (avgSec < 60)   return `~${Math.round(avgSec)} seg`
  if (avgSec < 3600) return `~${Math.round(avgSec / 60)} min`
  return `~${(avgSec / 3600).toFixed(1)} h`
}

function extractFirstName(fullName: string): string {
  if (!fullName?.trim()) return 'cliente'
  const first = fullName.trim().split(/\s+/)[0]
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function isInBusinessHours(start: string, end: string): boolean {
  const now = new Date()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const cur = now.getHours() * 60 + now.getMinutes()
  return cur >= sh * 60 + sm && cur < eh * 60 + em
}

function sleep(ms: number) {
  return new Promise<void>(res => setTimeout(res, ms))
}

function renderTemplate(text: string, variables: string[]): string {
  let result = text
  variables.forEach((v, i) => { result = result.replace(`{{${i + 1}}}`, v) })
  return result
}

// Reemplaza variables SMS: {{nombre}}, {{empresa}}, {{telefono}}
function renderSmsMessage(template: string, contact: any): string {
  return template
    .replace(/\{\{nombre\}\}/gi,   extractFirstName(contact.name || ''))
    .replace(/\{\{empresa\}\}/gi,  contact.company || '')
    .replace(/\{\{telefono\}\}/gi, contact.phone   || '')
}

// SMS daily counter (localStorage)
const SMS_COUNTER_KEY = 'ipesa_sms_daily_counter'
function getTodayKey() { return new Date().toISOString().split('T')[0] }
function getSmsDailySent(): number {
  if (typeof window === 'undefined') return 0
  try {
    const data = JSON.parse(localStorage.getItem(SMS_COUNTER_KEY) || '{}')
    return data.date === getTodayKey() ? (data.count || 0) : 0
  } catch { return 0 }
}
function addSmsDailySent(n: number) {
  if (typeof window === 'undefined') return
  const current = getSmsDailySent()
  localStorage.setItem(SMS_COUNTER_KEY, JSON.stringify({ date: getTodayKey(), count: current + n }))
}

// SMS segments count
function smsSegments(text: string): number {
  if (text.length === 0) return 0
  if (text.length <= 160) return 1
  return Math.ceil(text.length / 153)
}

const STATUSES = [
  { value: '', label: 'Todos los estados' },
  { value: 'nuevo',      label: 'Nuevo' },
  { value: 'contactado', label: 'Contactado' },
  { value: 'interesado', label: 'Interesado' },
  { value: 'cliente',    label: 'Cliente' },
  { value: 'rechazado',  label: 'Rechazado' },
]

// ── Componente ────────────────────────────────────────────────────────────────
export default function Mensajeria() {
  // Canal activo
  const [channel, setChannel] = useState<Channel>('whatsapp')

  // Datos base
  const [step, setStep]         = useState<Step>('select')
  const [contacts, setContacts] = useState<any[]>([])
  const [segments, setSegments] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Filtros (step 1)
  const [search, setSearch]               = useState('')
  const [filterSegment, setFilterSegment] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [onlyPhone, setOnlyPhone]         = useState(true)

  // ── WhatsApp state ──────────────────────────────────────────────────────
  const [templates, setTemplates]               = useState<YCloudTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<YCloudTemplate | null>(null)

  // ── SMS state ───────────────────────────────────────────────────────────
  const [smsMessage, setSmsMessage]                 = useState('')
  const [smsTemplates, setSmsTemplates]             = useState<SmsTemplate[]>([])
  const [smsTemplatesLoading, setSmsTemplatesLoading] = useState(false)
  const [newTplName, setNewTplName]                 = useState('')
  const [showSaveTpl, setShowSaveTpl]               = useState(false)
  const [savingTpl, setSavingTpl]                   = useState(false)
  const [dailyLimit, setDailyLimit]                 = useState(200)
  const [smsDailySent, setSmsDailySent]             = useState(0)

  // Anti-spam (compartido)
  const [delayPreset, setDelayPreset]   = useState<DelayPreset>('normal')
  const [businessHours, setBusinessHours] = useState(true)
  const [bhStart, setBhStart]           = useState('09:00')
  const [bhEnd, setBhEnd]               = useState('19:00')

  // Estado de envío (compartido)
  const [log, setLog]           = useState<LogEntry[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0, sent: 0, failed: 0, skipped: 0 })
  const [isSending, setIsSending] = useState(false)
  const [isDone, setIsDone]     = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const isPaused    = useRef(false)
  const isCancelled = useRef(false)
  const logEndRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (log.length > 0) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  useEffect(() => {
    setSmsDailySent(getSmsDailySent())
  }, [])

  const fetchAll = async () => {
    try {
      const [cts, segs] = await Promise.all([getContacts(), getSegments()])
      setContacts(cts)
      setSegments(segs)
    } catch { toast.error('Error al cargar contactos') }
    finally { setLoading(false) }
  }

  // Cambia canal y resetea pasos
  const switchChannel = (ch: Channel) => {
    setChannel(ch)
    setStep('select')
    setSelected(new Set())
    setSelectedTemplate(null)
    setSmsMessage('')
    setLog([])
    setIsDone(false)
    setCountdown(null)
    isPaused.current    = false
    isCancelled.current = false
  }

  // ── WhatsApp templates ────────────────────────────────────────────────
  const fetchWaTemplates = async () => {
    try {
      const res  = await fetch('/api/ycloud/templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplates(data.templates)
      if (data.templates.length === 1) setSelectedTemplate(data.templates[0])
    } catch (err: any) { toast.error('Error al cargar plantillas: ' + err.message) }
  }

  // ── SMS templates ─────────────────────────────────────────────────────
  const fetchSmsTemplates = async () => {
    setSmsTemplatesLoading(true)
    try {
      const res  = await fetch('/api/twilio/templates')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSmsTemplates(data.templates || [])
    } catch (err: any) { toast.error('Error al cargar plantillas SMS: ' + err.message) }
    finally { setSmsTemplatesLoading(false) }
  }

  const saveSmsTemplate = async () => {
    if (!newTplName.trim()) { toast.error('Ponle un nombre a la plantilla'); return }
    if (!smsMessage.trim()) { toast.error('El mensaje está vacío'); return }
    setSavingTpl(true)
    try {
      const res  = await fetch('/api/twilio/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTplName.trim(), content: smsMessage }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSmsTemplates(prev => [data.template, ...prev])
      setNewTplName('')
      setShowSaveTpl(false)
      toast.success('Plantilla guardada')
    } catch (err: any) { toast.error('Error: ' + err.message) }
    finally { setSavingTpl(false) }
  }

  const deleteSmsTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/twilio/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      setSmsTemplates(prev => prev.filter(t => t.id !== id))
      toast.success('Plantilla eliminada')
    } catch (err: any) { toast.error(err.message) }
  }

  // ── Filtered contacts ────────────────────────────────────────────────
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      if (onlyPhone && !c.phone) return false
      if (filterSegment && c.segment?.toLowerCase() !== filterSegment.toLowerCase()) return false
      if (filterStatus && c.prospect_status !== filterStatus) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.name?.toLowerCase().includes(q) && !c.company?.toLowerCase().includes(q) && !c.phone?.includes(q)) return false
      }
      return true
    })
  }, [contacts, search, filterSegment, filterStatus, onlyPhone])

  const toggleContact = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const toggleAll = () => {
    const allIds = filteredContacts.map(c => c.id)
    const allSel = allIds.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      allSel ? allIds.forEach(id => n.delete(id)) : allIds.forEach(id => n.add(id))
      return n
    })
  }

  const selectedContacts = useMemo(
    () => contacts.filter(c => selected.has(c.id)),
    [contacts, selected]
  )

  // WhatsApp preview
  const bodyComponent = selectedTemplate?.components.find((c: any) => c.type === 'BODY')
  const bodyText      = bodyComponent?.text || ''
  const previewFirst  = selectedContacts[0] ? extractFirstName(selectedContacts[0].name) : 'Juan'
  const previewText   = renderTemplate(bodyText, [previewFirst])

  // SMS preview
  const smsPreview = selectedContacts[0]
    ? renderSmsMessage(smsMessage, selectedContacts[0])
    : renderSmsMessage(smsMessage, { name: 'Juan Pérez', company: 'Tu Empresa', phone: '5512345678' })

  // ── Step navigation ──────────────────────────────────────────────────
  const MAX_WA  = 250
  const smsRemaining = Math.max(0, dailyLimit - smsDailySent)

  const goToPreview = () => {
    if (selected.size === 0) { toast.error('Selecciona al menos un contacto'); return }
    if (channel === 'whatsapp') {
      if (selected.size > MAX_WA) { toast.error(`Máximo ${MAX_WA} contactos por día (límite YCloud)`); return }
      fetchWaTemplates()
    } else {
      if (selected.size > smsRemaining) {
        toast.error(`Límite diario: solo te quedan ${smsRemaining} SMS hoy`); return
      }
      fetchSmsTemplates()
    }
    setStep('preview')
  }

  const goToConfig = () => {
    if (channel === 'whatsapp' && !selectedTemplate) { toast.error('Selecciona una plantilla'); return }
    if (channel === 'sms') {
      if (!smsMessage.trim()) { toast.error('Escribe el mensaje SMS'); return }
      // SMS Masivos: sin configuración manual, las reglas se aplican por defecto
      startSend()
      return
    }
    setStep('config')
  }

  // ── Send loop ────────────────────────────────────────────────────────
  const startSend = async () => {
    const queue = selectedContacts
    setIsDone(false)
    setIsSending(true)
    isPaused.current    = false
    isCancelled.current = false

    const initialLog: LogEntry[] = queue.map(c => ({
      contactId: c.id, name: c.name, phone: c.phone || '', status: 'pending',
    }))
    setLog(initialLog)
    setProgress({ current: 0, total: queue.length, sent: 0, failed: 0, skipped: 0 })
    setStep('sending')

    let sent = 0, failed = 0, skipped = 0

    const updateEntry = (id: string, patch: Partial<LogEntry>) => {
      setLog(prev => prev.map(e => e.contactId === id ? { ...e, ...patch } : e))
    }

    for (let i = 0; i < queue.length; i++) {
      if (isCancelled.current) break

      while (isPaused.current && !isCancelled.current) await sleep(500)
      if (isCancelled.current) break

      const contact = queue[i]

      if (!contact.phone) {
        skipped++
        updateEntry(contact.id, { status: 'skipped', error: 'Sin teléfono' })
        setProgress(p => ({ ...p, current: i + 1, skipped }))
        continue
      }

      // SMS Masivos: horario forzado 8am-8pm. WhatsApp: según configuración del usuario
      const outOfHours = channel === 'sms'
        ? !isInBusinessHours('08:00', '20:00')
        : businessHours && !isInBusinessHours(bhStart, bhEnd)
      if (outOfHours) {
        skipped++
        updateEntry(contact.id, { status: 'skipped', error: 'Fuera de horario (8am–8pm)' })
        setProgress(p => ({ ...p, current: i + 1, skipped }))
        continue
      }

      updateEntry(contact.id, { status: 'sending' })

      try {
        let res: Response

        if (channel === 'whatsapp') {
          res = await fetch('/api/ycloud/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: contact.phone,
              templateName: selectedTemplate!.name,
              language:     selectedTemplate!.language,
              variables:    [extractFirstName(contact.name)],
            }),
          })
        } else {
          const message = renderSmsMessage(smsMessage, contact)
          res = await fetch('/api/twilio/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: contact.phone, message }),
          })
        }

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al enviar')

        sent++
        if (channel === 'sms') addSmsDailySent(1)
        updateEntry(contact.id, { status: 'sent', sentAt: new Date() })
        setProgress(p => ({ ...p, current: i + 1, sent }))
      } catch (err: any) {
        failed++
        updateEntry(contact.id, { status: 'failed', error: err.message })
        setProgress(p => ({ ...p, current: i + 1, failed }))
      }

      if (i < queue.length - 1 && !isCancelled.current) {
        // SMS Masivos: 3 segundos fijos. WhatsApp: delay gaussiano según preset
        const delayMs = channel === 'sms' ? 3000 : gaussianDelay(DELAY_PRESETS[delayPreset].min, DELAY_PRESETS[delayPreset].max)
        const endTime  = Date.now() + delayMs
        while (Date.now() < endTime && !isCancelled.current) {
          setCountdown(Math.ceil((endTime - Date.now()) / 1000))
          await sleep(500)
          while (isPaused.current && !isCancelled.current) await sleep(500)
        }
        setCountdown(null)
      }
    }

    setIsSending(false)
    setIsDone(true)
    setCountdown(null)
    if (channel === 'sms') setSmsDailySent(getSmsDailySent())
    if (!isCancelled.current) toast.success(`Envío completado: ${sent} enviados, ${failed} fallidos, ${skipped} saltados`)
  }

  const reset = () => {
    setStep('select')
    setSelected(new Set())
    setSelectedTemplate(null)
    setSmsMessage('')
    setLog([])
    setIsDone(false)
    setCountdown(null)
    isPaused.current    = false
    isCancelled.current = false
    if (channel === 'sms') setSmsDailySent(getSmsDailySent())
  }

  // ── Step labels por canal ────────────────────────────────────────────
  const STEPS_WA  = [
    { key: 'select',  label: 'Contactos' },
    { key: 'preview', label: 'Plantilla' },
    { key: 'config',  label: 'Anti-spam' },
    { key: 'sending', label: 'Envío' },
  ]
  const STEPS_SMS = [
    { key: 'select',  label: 'Contactos' },
    { key: 'preview', label: 'Mensaje' },
    { key: 'sending', label: 'Envío' },
  ]
  const STEPS   = channel === 'whatsapp' ? STEPS_WA : STEPS_SMS
  const stepIdx = STEPS.findIndex(s => s.key === step)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="mb-5">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Centro de Mensajería</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Envíos masivos con sistema anti-spam inteligente</p>
          </div>

          {/* ── Channel tabs ─────────────────────────────────────────────────── */}
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
            <button
              onClick={() => switchChannel('whatsapp')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                channel === 'whatsapp'
                  ? 'bg-white dark:bg-gray-700 text-green-700 dark:text-green-300 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <MessageCircle size={16} />
              WhatsApp
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                channel === 'whatsapp'
                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>YCloud</span>
            </button>
            <button
              onClick={() => switchChannel('sms')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                channel === 'sms'
                  ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <MessageSquare size={16} />
              SMS
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                channel === 'sms'
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}>SMS Masivos</span>
            </button>
          </div>

          {/* ── Step indicator ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-0 mb-8">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                    i < stepIdx  ? 'bg-green-500 text-white' :
                    i === stepIdx
                      ? channel === 'sms' ? 'bg-red-600 text-white' : 'bg-primary-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    {i < stepIdx ? <CheckCircle size={16} /> : i + 1}
                  </div>
                  <span className={`text-xs font-semibold mt-1 hidden sm:block ${
                    i === stepIdx
                      ? channel === 'sms' ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 ${i < stepIdx ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              STEP 1: SELECCIONAR CONTACTOS (igual para ambos canales)
          ════════════════════════════════════════════════════════════════════ */}
          {step === 'select' && (
            <div className="space-y-4">
              <Card variant="elevated" className="p-5">
                {/* Filtros */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text" placeholder="Buscar nombre, empresa, tel..."
                      value={search} onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                    />
                  </div>
                  <select
                    value={filterSegment} onChange={e => setFilterSegment(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                  >
                    <option value="">Todos los segmentos</option>
                    {segments.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  <select
                    value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark-mode-transition"
                  >
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                {/* Quick filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={() => setOnlyPhone(!onlyPhone)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      onlyPhone ? 'bg-green-600 border-green-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <Phone size={11} /> Solo con teléfono
                  </button>
                  <button
                    onClick={() => setFilterStatus(filterStatus === 'nuevo' ? '' : 'nuevo')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      filterStatus === 'nuevo' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Sin contactar
                  </button>
                  <button
                    onClick={() => setFilterStatus(filterStatus === 'interesado' ? '' : 'interesado')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      filterStatus === 'interesado' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Interesados
                  </button>
                  {(search || filterSegment || filterStatus) && (
                    <button onClick={() => { setSearch(''); setFilterSegment(''); setFilterStatus('') }}
                      className="text-xs text-gray-400 hover:text-red-500 underline transition">
                      Limpiar
                    </button>
                  )}
                </div>

                {/* Select all row */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <input type="checkbox"
                      checked={filteredContacts.length > 0 && filteredContacts.every(c => selected.has(c.id))}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {filteredContacts.length.toLocaleString()} contactos visibles
                    </span>
                  </div>
                  {selected.size > 0 && (
                    <span className={`text-sm font-bold ${
                      channel === 'sms' ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'
                    }`}>
                      {selected.size.toLocaleString()} seleccionados
                    </span>
                  )}
                </div>

                {/* Contact list */}
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600" />
                  </div>
                ) : (
                  <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
                    {filteredContacts.length === 0 ? (
                      <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                        <Users size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Sin contactos que coincidan</p>
                      </div>
                    ) : (
                      filteredContacts.slice(0, 300).map(c => {
                        const seg = segments.find(s => s.name.toLowerCase() === c.segment?.toLowerCase())
                        return (
                          <div key={c.id} onClick={() => toggleContact(c.id)}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 dark:border-gray-700/50 transition ${
                              selected.has(c.id) ? 'bg-blue-50 dark:bg-blue-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            }`}
                          >
                            <input type="checkbox" checked={selected.has(c.id)}
                              onChange={() => toggleContact(c.id)}
                              onClick={e => e.stopPropagation()}
                              className="w-4 h-4 accent-blue-600 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.phone || 'Sin teléfono'} {c.company ? `· ${c.company}` : ''}</p>
                            </div>
                            {seg && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 hidden sm:inline"
                                style={{ backgroundColor: seg.color + '25', color: seg.color }}>
                                {seg.name}
                              </span>
                            )}
                          </div>
                        )
                      })
                    )}
                    {filteredContacts.length > 300 && (
                      <div className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center border-t border-gray-100 dark:border-gray-700">
                        Mostrando 300 de {filteredContacts.length.toLocaleString()} — usa filtros para afinar
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* Límite WhatsApp */}
              {channel === 'whatsapp' && selected.size > MAX_WA && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-xl text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle size={16} />
                  Límite diario de YCloud: {MAX_WA} conversaciones. Tienes {selected.size} seleccionados.
                </div>
              )}

              {/* Límite SMS */}
              {channel === 'sms' && (
                <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-300">
                  <MessageSquare size={15} className="text-red-500 flex-shrink-0" />
                  <span>
                    SMS enviados hoy: <strong>{smsDailySent}</strong> / {dailyLimit} configurados
                    {' · '}Disponibles: <strong className={smsRemaining < selected.size ? 'text-red-500' : 'text-green-600 dark:text-green-400'}>{smsRemaining}</strong>
                  </span>
                </div>
              )}
              {channel === 'sms' && selected.size > smsRemaining && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-800 dark:text-red-300">
                  <AlertTriangle size={16} />
                  Superaste el límite diario. Reduce la selección a {smsRemaining} o menos.
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  variant="primary"
                  onClick={goToPreview}
                  disabled={
                    selected.size === 0 ||
                    (channel === 'whatsapp' && selected.size > MAX_WA) ||
                    (channel === 'sms' && selected.size > smsRemaining)
                  }
                  className={channel === 'sms' ? '!bg-red-600 hover:!bg-red-700' : ''}
                >
                  Siguiente — {channel === 'whatsapp' ? 'Plantilla' : 'Mensaje'} <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2-WA: PLANTILLA WHATSAPP
          ════════════════════════════════════════════════════════════════════ */}
          {step === 'preview' && channel === 'whatsapp' && (
            <div className="space-y-4">
              <Card variant="elevated" className="p-5">
                <h2 className="font-bold text-gray-900 dark:text-white mb-3">Plantillas aprobadas</h2>
                {templates.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-200 border-t-blue-600 mx-auto mb-3" />
                    Cargando plantillas...
                  </div>
                ) : (
                  <div className="space-y-2">
                    {templates.map(t => (
                      <button key={t.name} onClick={() => setSelectedTemplate(t)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition ${
                          selectedTemplate?.name === t.name
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm text-gray-900 dark:text-white">{t.name}</span>
                          <div className="flex gap-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold">✓ Aprobada</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{t.language}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {t.components.find((c: any) => c.type === 'BODY')?.text?.replace(/\n/g, ' ')}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {selectedTemplate && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Eye size={16} className="text-gray-400" />
                    <h2 className="font-bold text-gray-900 dark:text-white">Preview con primer contacto</h2>
                    <span className="text-xs text-gray-400 dark:text-gray-500">— {selectedContacts[0]?.name}</span>
                  </div>
                  <div className="bg-[#e5ddd5] dark:bg-[#1a1a2e] rounded-xl p-4">
                    <div className="max-w-xs ml-auto">
                      <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-xl rounded-br-sm px-3 py-2 shadow-sm">
                        <p className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line leading-relaxed">{previewText}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-400 text-right mt-1">
                          {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} ✓✓
                        </p>
                      </div>
                      {selectedTemplate.components.find((c: any) => c.type === 'BUTTONS')?.buttons?.map((btn: any, i: number) => (
                        <div key={i} className="mt-1 bg-white dark:bg-[#202c33] rounded-lg px-3 py-2 text-center text-sm font-semibold text-[#00a9ff] shadow-sm">
                          {btn.text}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                    ✦ <code>{'{{1}}'}</code> → primer nombre del contacto
                  </p>
                </Card>
              )}

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep('select')}><ChevronLeft size={16} /> Atrás</Button>
                <Button variant="primary" onClick={goToConfig} disabled={!selectedTemplate}>
                  Siguiente — Anti-spam <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 2-SMS: EDITOR DE MENSAJE SMS
          ════════════════════════════════════════════════════════════════════ */}
          {step === 'preview' && channel === 'sms' && (
            <div className="space-y-4">
              {/* Editor */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-gray-900 dark:text-white">Redactar mensaje SMS</h2>
                  <div className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    smsMessage.length === 0 ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' :
                    smsMessage.length <= 160 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' :
                    'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                  }`}>
                    {smsMessage.length} car · {smsSegments(smsMessage)} SMS{smsSegments(smsMessage) > 1 ? ' (concatenado)' : ''}
                  </div>
                </div>

                <textarea
                  value={smsMessage}
                  onChange={e => setSmsMessage(e.target.value)}
                  placeholder="Hola {{nombre}}, te escribimos desde IPESA. ¿Tienes un momento para hablar?"
                  rows={5}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400 resize-none dark-mode-transition"
                />

                {/* Variables helper */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold">Insertar:</span>
                  {[
                    { label: '{{nombre}}',   value: '{{nombre}}' },
                    { label: '{{empresa}}',  value: '{{empresa}}' },
                    { label: '{{telefono}}', value: '{{telefono}}' },
                  ].map(v => (
                    <button key={v.value} onClick={() => setSmsMessage(prev => prev + v.value)}
                      className="text-xs px-2 py-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 font-mono transition">
                      {v.label}
                    </button>
                  ))}
                </div>

                {/[áéíóúüñÁÉÍÓÚÜÑ]/.test(smsMessage) && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertTriangle size={12} /> Contiene acentos o ñ — el límite baja a <strong>70 caracteres</strong> por SMS (regla SMS Masivos). Elimínalos para 160 caracteres.
                  </p>
                )}
                {!(/[áéíóúüñÁÉÍÓÚÜÑ]/.test(smsMessage)) && smsMessage.length > 160 && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle size={12} /> Mensaje largo: se enviará en {smsSegments(smsMessage)} partes concatenadas (costo x{smsSegments(smsMessage)})
                  </p>
                )}
              </Card>

              {/* Plantillas guardadas */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-gray-900 dark:text-white">Plantillas guardadas</h2>
                  <div className="flex gap-2">
                    <button onClick={fetchSmsTemplates}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                      <RefreshCw size={14} className={smsTemplatesLoading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => setShowSaveTpl(!showSaveTpl)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition">
                      <Save size={12} /> Guardar actual
                    </button>
                  </div>
                </div>

                {/* Guardar plantilla form */}
                {showSaveTpl && (
                  <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                    <div className="flex gap-2">
                      <input
                        type="text" placeholder="Nombre de la plantilla..."
                        value={newTplName} onChange={e => setNewTplName(e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-red-400"
                      />
                      <button onClick={saveSmsTemplate} disabled={savingTpl}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 transition">
                        {savingTpl ? '...' : 'Guardar'}
                      </button>
                      <button onClick={() => setShowSaveTpl(false)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {smsTemplatesLoading ? (
                  <div className="py-6 text-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-red-200 border-t-red-500 mx-auto" />
                  </div>
                ) : smsTemplates.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                    No hay plantillas guardadas — escribe un mensaje y guárdalo
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {smsTemplates.map(t => (
                      <div key={t.id}
                        className="flex items-start gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 cursor-pointer group transition"
                        onClick={() => setSmsMessage(t.content)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{t.content}</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); deleteSmsTemplate(t.id) }}
                          className="flex-shrink-0 p-1 rounded text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Reglas activas SMS Masivos */}
              <div className="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Clock size={11} className="text-green-500" /> Horario: 8am – 8pm</span>
                <span className="flex items-center gap-1"><Zap size={11} className="text-blue-500" /> Delay: 3 seg entre mensajes</span>
                <span className="flex items-center gap-1"><CheckCircle size={11} className="text-purple-500" /> Carrier: Telcel, Movistar, AT&T</span>
              </div>

              {/* Preview SMS */}
              {smsMessage.trim() && (
                <Card variant="elevated" className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Eye size={16} className="text-gray-400" />
                    <h2 className="font-bold text-gray-900 dark:text-white">Preview del SMS</h2>
                    <span className="text-xs text-gray-400 dark:text-gray-500">— {selectedContacts[0]?.name || 'Juan Pérez'}</span>
                  </div>
                  <div className="bg-gray-900 dark:bg-black rounded-xl p-4">
                    <div className="max-w-xs">
                      <div className="bg-gray-700 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                        <p className="text-sm text-white whitespace-pre-line leading-relaxed">{smsPreview}</p>
                        <p className="text-xs text-gray-400 text-right mt-1">
                          {new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 ml-1">+1 (877) 780-4236</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                    ✦ Las variables <code>{'{{nombre}}'}</code>, <code>{'{{empresa}}'}</code> se reemplazan por cada contacto
                  </p>
                </Card>
              )}

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep('select')}><ChevronLeft size={16} /> Atrás</Button>
                <Button variant="primary" onClick={goToConfig} disabled={!smsMessage.trim()}
                  className="!bg-red-600 hover:!bg-red-700">
                  <Send size={16} /> Iniciar envío
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 3: ANTI-SPAM CONFIG (compartido, con variaciones por canal)
          ════════════════════════════════════════════════════════════════════ */}
          {step === 'config' && (
            <div className="space-y-4">
              {/* Resumen */}
              <Card variant="elevated" className="p-5">
                <h2 className="font-bold text-gray-900 dark:text-white mb-4">Resumen del envío</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{selected.size}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Contactos</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-xl">
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {selectedContacts.filter(c => c.phone).length}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">Con teléfono</p>
                  </div>
                  {channel === 'whatsapp' ? (
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl">
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{MAX_WA - selected.size}</p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">Cupo restante</p>
                    </div>
                  ) : (
                    <div className="text-center p-3 bg-red-50 dark:bg-red-950/30 rounded-xl">
                      <p className="text-2xl font-bold text-red-700 dark:text-red-300">{smsRemaining - selected.size}</p>
                      <p className="text-xs text-red-600 dark:text-red-400">SMS restantes hoy</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Límite diario SMS */}
              {channel === 'sms' && (
                <Card variant="elevated" className="p-5">
                  <h2 className="font-bold text-gray-900 dark:text-white mb-1">Límite diario de SMS</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                    Control anti-banning. El contador se reinicia a medianoche. Enviados hoy: <strong>{smsDailySent}</strong>
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range" min={50} max={1000} step={50}
                      value={dailyLimit}
                      onChange={e => setDailyLimit(Number(e.target.value))}
                      className="flex-1 accent-red-600"
                    />
                    <div className="w-20 text-center">
                      <input type="number" min={1} max={9999}
                        value={dailyLimit}
                        onChange={e => setDailyLimit(Math.max(1, Number(e.target.value)))}
                        className="w-full text-center px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                      />
                      <p className="text-xs text-gray-400 mt-0.5">por día</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {[100, 200, 500].map(n => (
                      <button key={n} onClick={() => setDailyLimit(n)}
                        className={`py-1.5 rounded-lg border font-semibold transition ${
                          dailyLimit === n
                            ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300'
                        }`}>
                        {n}/día
                      </button>
                    ))}
                  </div>
                </Card>
              )}

              {/* Velocidad */}
              <Card variant="elevated" className="p-5">
                <h2 className="font-bold text-gray-900 dark:text-white mb-1">Velocidad de envío</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Distribución gaussiana — delays naturales como comportamiento humano</p>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.entries(DELAY_PRESETS) as [DelayPreset, any][]).map(([key, val]) => (
                    <button key={key} onClick={() => setDelayPreset(key)}
                      className={`p-4 rounded-xl border-2 text-left transition ${
                        delayPreset === key
                          ? key === 'rapido' ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                          : key === 'lento'  ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
                          : 'border-primary-400 bg-primary-50 dark:bg-primary-950/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <p className={`font-bold text-sm mb-1 ${
                        delayPreset === key
                          ? key === 'rapido' ? 'text-red-700 dark:text-red-300'
                          : key === 'lento'  ? 'text-green-700 dark:text-green-300'
                          : 'text-primary-700 dark:text-primary-300'
                          : 'text-gray-700 dark:text-gray-200'
                      }`}>{val.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{val.sub}</p>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Horario laboral */}
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Horario laboral</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Omite contactos fuera del horario configurado</p>
                  </div>
                  <button onClick={() => setBusinessHours(!businessHours)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${businessHours ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${businessHours ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {businessHours && (
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Inicio</label>
                      <input type="time" value={bhStart} onChange={e => setBhStart(e.target.value)}
                        className="block mt-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none" />
                    </div>
                    <span className="text-gray-400 mt-4">—</span>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Fin</label>
                      <input type="time" value={bhEnd} onChange={e => setBhEnd(e.target.value)}
                        className="block mt-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none" />
                    </div>
                    <div className={`mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      isInBusinessHours(bhStart, bhEnd)
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>
                      {isInBusinessHours(bhStart, bhEnd) ? '✓ En horario' : '✗ Fuera de horario'}
                    </div>
                  </div>
                )}
              </Card>

              {/* Tiempo estimado */}
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center gap-3">
                <Clock size={18} className="text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Tiempo estimado: <span className={channel === 'sms' ? 'text-red-600 dark:text-red-400' : 'text-primary-600 dark:text-primary-400'}>
                      {estimatedTime(selectedContacts.filter(c => c.phone).length, delayPreset)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {selectedContacts.filter(c => c.phone).length} mensajes via {channel === 'whatsapp' ? `plantilla: ${selectedTemplate?.name}` : 'SMS Twilio'}
                  </p>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep('preview')}><ChevronLeft size={16} /> Atrás</Button>
                <Button variant="primary" onClick={startSend}
                  className={channel === 'sms' ? '!bg-red-600 hover:!bg-red-700' : ''}>
                  <Send size={16} /> Iniciar envío
                </Button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              STEP 4: ENVIANDO (compartido)
          ════════════════════════════════════════════════════════════════════ */}
          {step === 'sending' && (
            <div className="space-y-4">
              <Card variant="elevated" className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-gray-900 dark:text-white">
                    {isDone ? 'Envío completado' : isSending ? `Enviando ${channel === 'sms' ? 'SMS vía SMS Masivos' : 'WhatsApp'}...` : 'Pausado'}
                  </h2>
                  <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                    {progress.current} / {progress.total}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${channel === 'sms' ? 'bg-red-600' : 'bg-primary-600'}`}
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-xl">
                    <p className="text-xl font-bold text-green-700 dark:text-green-300">{progress.sent}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">Enviados</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 dark:bg-red-950/30 rounded-xl">
                    <p className="text-xl font-bold text-red-700 dark:text-red-300">{progress.failed}</p>
                    <p className="text-xs text-red-600 dark:text-red-400">Fallidos</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                    <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{progress.skipped}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Saltados</p>
                  </div>
                </div>

                {/* Countdown */}
                {countdown !== null && !isPaused.current && (
                  <div className={`flex items-center gap-2 p-2 rounded-lg mb-3 text-sm ${
                    channel === 'sms'
                      ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                      : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  }`}>
                    <Zap size={14} />
                    Próximo mensaje en <strong>{countdown}s</strong>
                    <span className="text-xs opacity-60 ml-1">(delay anti-spam)</span>
                  </div>
                )}

                {/* Controles */}
                {!isDone && (
                  <div className="flex gap-2">
                    {isSending && !isPaused.current ? (
                      <Button variant="secondary" size="sm" onClick={() => { isPaused.current = true; setIsSending(false) }}>
                        <Pause size={14} /> Pausar
                      </Button>
                    ) : !isDone && (
                      <Button variant="primary" size="sm" onClick={() => { isPaused.current = false; setIsSending(true) }}>
                        <Play size={14} /> Reanudar
                      </Button>
                    )}
                    <Button variant="danger" size="sm" onClick={() => {
                      if (confirm('¿Cancelar el envío en curso?')) {
                        isCancelled.current = true
                        isPaused.current    = false
                        setIsSending(false)
                        setIsDone(true)
                      }
                    }}>
                      <StopCircle size={14} /> Cancelar
                    </Button>
                  </div>
                )}

                {isDone && (
                  <Button variant="primary" onClick={reset}
                    className={channel === 'sms' ? '!bg-red-600 hover:!bg-red-700' : ''}>
                    <MessageSquare size={16} /> Nueva campaña
                  </Button>
                )}
              </Card>

              {/* Live log */}
              <Card variant="elevated" className="overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">Registro en vivo</h3>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{log.filter(e => e.status === 'sent').length} enviados</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
                  {log.map(entry => (
                    <div key={entry.contactId} className={`flex items-center gap-3 px-5 py-3 ${
                      entry.status === 'sending' ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                    }`}>
                      <div className="flex-shrink-0">
                        {entry.status === 'sent'    && <CheckCircle size={16} className="text-green-500" />}
                        {entry.status === 'failed'  && <XCircle size={16} className="text-red-500" />}
                        {entry.status === 'skipped' && <SkipForward size={16} className="text-gray-400" />}
                        {entry.status === 'sending' && <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />}
                        {entry.status === 'pending' && <div className="w-4 h-4 rounded-full border-2 border-gray-200 dark:border-gray-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{entry.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{entry.phone}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {entry.status === 'sent'    && <span className="text-xs text-green-600 dark:text-green-400">Enviado</span>}
                        {entry.status === 'failed'  && <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[140px] block">{entry.error}</span>}
                        {entry.status === 'skipped' && <span className="text-xs text-gray-400 truncate max-w-[140px] block">{entry.error}</span>}
                        {entry.status === 'sending' && <span className="text-xs text-blue-600 dark:text-blue-400">Enviando...</span>}
                        {entry.status === 'pending' && <span className="text-xs text-gray-300 dark:text-gray-600">En cola</span>}
                      </div>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </Card>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
