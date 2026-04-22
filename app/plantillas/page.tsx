'use client'

import { useState, useEffect, useRef } from 'react'
import Navbar from '@/components/Navbar'
import toast from 'react-hot-toast'
import {
  Plus, Copy, Trash2, MessageSquare, Phone, Check, X,
  AlertTriangle, LayoutTemplate, Smile, Edit2, Sparkles, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type Channel = 'wa' | 'sms'

interface Template {
  id: string
  channel: Channel
  name: string
  body: string   // mapeado desde `content` de Supabase
  created_at: string
}

// ── SMS helpers ───────────────────────────────────────────────────────────────
const ACCENT_REGEX = /[áéíóúüÁÉÍÓÚÜñÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛãõÃÕäöÄÖ¿¡çÇ]/

function hasAccents(text: string) { return ACCENT_REGEX.test(text) }

function removeAccents(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿¡]/g, '')
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Plantillas() {
  const [channel, setChannel] = useState<Channel>('wa')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formBody, setFormBody] = useState('')

  // ── AI assistant state ─────────────────────────────────────────────────────
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiResult, setAiResult] = useState('')
  const [aiDone, setAiDone] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { fetchTemplates() }, [channel])

  async function fetchTemplates() {
    setLoading(true)
    try {
      const res = await fetch(`/api/data/templates?channel=${channel}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Supabase guarda el texto en `content`, lo exponemos como `body`
      setTemplates((data.templates ?? []).map((t: any) => ({ ...t, body: t.content })))
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cargar plantillas')
    } finally {
      setLoading(false)
    }
  }

  const SMS_LIMIT = 160
  const smsCount = formBody.length
  const smsOverLimit = smsCount > SMS_LIMIT
  const smsHasAccents = channel === 'sms' && hasAccents(formBody)

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) { toast.error('El nombre es requerido'); return }
    if (!formBody.trim()) { toast.error('El contenido es requerido'); return }
    if (channel === 'sms' && smsOverLimit) { toast.error(`El mensaje supera los ${SMS_LIMIT} caracteres`); return }
    if (channel === 'sms' && smsHasAccents) { toast.error('Hay acentos en el mensaje. Retíralos antes de guardar.'); return }

    setSaving(true)
    try {
      if (editingId) {
        const res = await fetch(`/api/data/templates/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName.trim(), body: formBody.trim() }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success('Plantilla actualizada')
      } else {
        const res = await fetch('/api/data/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, name: formName.trim(), body: formBody.trim() }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        toast.success('Plantilla guardada')
      }
      closeDrawer()
      fetchTemplates()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tpl: Template) {
    if (!confirm(`¿Eliminar la plantilla "${tpl.name}"?`)) return
    try {
      const res = await fetch(`/api/data/templates/${tpl.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Plantilla eliminada')
      setTemplates(prev => prev.filter(t => t.id !== tpl.id))
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar')
    }
  }

  async function handleCopy(tpl: Template) {
    try {
      await navigator.clipboard.writeText(tpl.body)
      setCopiedId(tpl.id)
      toast.success('¡Copiado al portapapeles!')
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  function applyRemoveAccents() {
    setFormBody(removeAccents(formBody))
    toast.success('Acentos eliminados')
  }

  async function handleGenerateAI() {
    if (!aiPrompt.trim()) { toast.error('Describe qué tipo de plantilla necesitas'); return }
    setAiGenerating(true)
    setAiResult('')
    setAiDone(false)

    try {
      const res = await fetch('/api/ai/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, prompt: aiPrompt }),
      })
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? ''
        const msg = ct.includes('json') ? (await res.json()).error : `Error ${res.status}`
        throw new Error(msg ?? 'Error al generar')
      }
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setAiResult(accumulated)
      }

      setAiDone(true)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al generar con IA')
    } finally {
      setAiGenerating(false)
    }
  }

  function applyAIResult() {
    if (!aiResult.trim()) return
    setFormBody(aiResult.trim())
    setShowAI(false)
    textareaRef.current?.focus()
  }

  function openDrawer() {
    setEditingId(null)
    setFormName('')
    setFormBody('')
    setShowAI(false)
    setAiPrompt('')
    setAiResult('')
    setAiDone(false)
    setShowDrawer(true)
  }

  function openEdit(tpl: Template) {
    setEditingId(tpl.id)
    setFormName(tpl.name)
    setFormBody(tpl.body)
    setShowAI(false)
    setAiPrompt('')
    setAiResult('')
    setAiDone(false)
    setShowDrawer(true)
  }

  function closeDrawer() {
    setShowDrawer(false)
    setEditingId(null)
    setFormName('')
    setFormBody('')
    setShowAI(false)
    setAiPrompt('')
    setAiResult('')
    setAiDone(false)
  }

  // ── Colors ─────────────────────────────────────────────────────────────────
  const isWA = channel === 'wa'
  const ac = isWA
    ? { bg: 'bg-green-600', hover: 'hover:bg-green-700', light: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' }
    : { bg: 'bg-blue-600',  hover: 'hover:bg-blue-700',  light: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',   border: 'border-blue-200 dark:border-blue-800' }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 pb-24 lg:pb-8 dark-mode-transition">
        <div className="max-w-4xl mx-auto px-3 sm:px-4">

          {/* Header */}
          <div className="flex flex-wrap gap-3 justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                <LayoutTemplate size={28} className="text-gray-500 dark:text-gray-400" />
                Plantillas
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">
                Crea y copia plantillas de mensajes para WhatsApp y SMS
              </p>
            </div>
            <button
              onClick={openDrawer}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${ac.bg} ${ac.hover} text-white font-semibold text-sm transition shadow-sm`}
            >
              <Plus size={16} /> Nueva plantilla
            </button>
          </div>

          {/* Channel tabs */}
          <div className="flex gap-2 mb-6 bg-white dark:bg-gray-800 rounded-xl p-1.5 shadow-sm border border-gray-100 dark:border-gray-700 w-fit">
            <button
              onClick={() => setChannel('wa')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                channel === 'wa' ? 'bg-green-600 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <MessageSquare size={15} /> WhatsApp
            </button>
            <button
              onClick={() => setChannel('sms')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                channel === 'sms' ? 'bg-blue-600 text-white shadow' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <Phone size={15} /> SMS
            </button>
          </div>

          {/* Info banner */}
          <div className={`mb-5 rounded-xl border px-4 py-3 flex items-start gap-3 ${ac.light} ${ac.border}`}>
            {isWA ? (
              <>
                <Smile size={16} className={`${ac.text} mt-0.5 flex-shrink-0`} />
                <p className={`text-xs ${ac.text}`}>
                  <span className="font-semibold">WhatsApp:</span> admite texto libre, emojis, formato (*negrita*, _cursiva_), saltos de línea y variables como <code className="bg-black/5 dark:bg-white/10 px-1 rounded">{'{{1}}'}</code>.
                </p>
              </>
            ) : (
              <>
                <AlertTriangle size={16} className={`${ac.text} mt-0.5 flex-shrink-0`} />
                <p className={`text-xs ${ac.text}`}>
                  <span className="font-semibold">SMS:</span> máximo <span className="font-semibold">160 caracteres</span> por mensaje. <span className="font-semibold">No se permiten acentos</span> (á, é, ñ, ¡, ¿, etc.) ya que generan cobros extra o truncan el mensaje.
                </p>
              </>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
            </div>
          ) : templates.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 sm:p-16 text-center dark-mode-transition">
              <LayoutTemplate size={56} className="text-gray-200 dark:text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 font-semibold text-lg mb-1">
                Sin plantillas de {isWA ? 'WhatsApp' : 'SMS'}
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mb-5">
                Crea tu primera plantilla para copiarla fácilmente cuando la necesites
              </p>
              <button
                onClick={openDrawer}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl ${ac.bg} ${ac.hover} text-white font-semibold text-sm transition`}
              >
                <Plus size={16} /> Crear primera plantilla
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden dark-mode-transition">

                  {/* Card header */}
                  <div className={`px-4 py-3 flex items-center justify-between border-b ${ac.border} ${ac.light}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {isWA
                        ? <MessageSquare size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                        : <Phone size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      }
                      <span className={`text-sm font-bold truncate ${ac.text}`}>{tpl.name}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleCopy(tpl)}
                        title="Copiar mensaje"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                          copiedId === tpl.id
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                            : `${ac.bg} ${ac.hover} text-white`
                        }`}
                      >
                        {copiedId === tpl.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === tpl.id ? 'Copiado' : 'Copiar'}
                      </button>
                      <button
                        onClick={() => openEdit(tpl)}
                        title="Editar plantilla"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(tpl)}
                        title="Eliminar plantilla"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-4 py-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-6">
                      {tpl.body}
                    </p>
                  </div>

                  {/* Card footer */}
                  <div className="px-4 pb-3 flex items-center justify-between">
                    {channel === 'sms' && (
                      <span className={`text-xs font-semibold ${tpl.body.length > SMS_LIMIT ? 'text-red-600' : 'text-gray-400 dark:text-gray-500'}`}>
                        {tpl.body.length}/{SMS_LIMIT} chars
                      </span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                      {new Date(tpl.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Drawer ──────────────────────────────────────────────────────────── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col sm:flex-row">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="relative w-full sm:ml-auto sm:max-w-md h-[93dvh] sm:h-full mt-auto sm:mt-0 rounded-t-2xl sm:rounded-none bg-white dark:bg-gray-900 shadow-2xl flex flex-col">

            {/* Header */}
            <div className={`${isWA ? 'bg-gradient-to-br from-green-600 to-green-700' : 'bg-gradient-to-br from-blue-600 to-blue-700'} px-5 py-5 flex-shrink-0`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    {isWA ? <MessageSquare size={20} className="text-white" /> : <Phone size={20} className="text-white" />}
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg leading-tight">
                      {editingId ? 'Editar plantilla' : `Nueva plantilla ${isWA ? 'WhatsApp' : 'SMS'}`}
                    </h2>
                    <p className="text-white/70 text-xs">
                      {isWA ? 'Emojis y texto libre permitidos' : `Máx. ${SMS_LIMIT} caracteres · Sin acentos`}
                    </p>
                  </div>
                </div>
                <button onClick={closeDrawer} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col">
              <div className="px-5 py-5 space-y-5 flex-1">

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                    Nombre de la plantilla <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="ej: Saludo inicial, Seguimiento, Oferta"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500 dark-mode-transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                      Mensaje <span className="text-red-500">*</span>
                    </label>
                    {channel === 'sms' && (
                      <span className={`text-xs font-bold tabular-nums ${
                        smsOverLimit ? 'text-red-600 dark:text-red-400'
                        : smsCount > 140 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {smsCount}/{SMS_LIMIT}
                      </span>
                    )}
                  </div>
                  <textarea
                    ref={textareaRef}
                    required
                    rows={isWA ? 8 : 6}
                    placeholder={isWA
                      ? 'Hola {{1}}, te contactamos de IPESA...\n\nPuedes usar emojis 😊, *negrita*, _cursiva_ y saltos de línea.'
                      : 'Hola, te contactamos de IPESA. Tenemos una oferta para ti. Llama al 555-1234.'
                    }
                    value={formBody}
                    onChange={e => setFormBody(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500 resize-none leading-relaxed dark-mode-transition ${
                      smsOverLimit || smsHasAccents ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
                    }`}
                  />

                  {channel === 'sms' && (
                    <div className="mt-2 space-y-2">
                      {smsHasAccents && (
                        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold leading-snug">Acentos detectados</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400 leading-snug">Pueden generar cobros extra o truncar el SMS.</p>
                          </div>
                          <button type="button" onClick={applyRemoveAccents}
                            className="flex-shrink-0 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-md transition">
                            Eliminar
                          </button>
                        </div>
                      )}
                      {smsOverLimit && (
                        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                          <AlertTriangle size={13} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                          <p className="text-xs text-red-700 dark:text-red-400 font-semibold">
                            Supera el límite por {smsCount - SMS_LIMIT} caracteres
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {isWA && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                      Usa <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{1}}'}</code>, <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{{2}}'}</code>… para variables de nombre, empresa, etc.
                    </p>
                  )}
                </div>

                {/* ── AI Assistant ──────────────────────────────────────── */}
                <div className="rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAI(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-violet-600 dark:text-violet-400" />
                      <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">Asistente IA</span>
                      <span className="hidden sm:inline text-xs text-violet-500 dark:text-violet-400">— genera el texto automáticamente</span>
                    </div>
                    {showAI
                      ? <ChevronUp size={15} className="text-violet-500 dark:text-violet-400 flex-shrink-0" />
                      : <ChevronDown size={15} className="text-violet-500 dark:text-violet-400 flex-shrink-0" />
                    }
                  </button>

                  {showAI && (
                    <div className="px-4 py-4 space-y-3 bg-white dark:bg-gray-900">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                          ¿Qué tipo de mensaje necesitas?
                        </label>
                        <textarea
                          rows={3}
                          placeholder={isWA
                            ? 'ej: mensaje de bienvenida para ferretería nueva, oferta de impermeabilizante, seguimiento después de visita...'
                            : 'ej: recordatorio de visita, oferta especial breve, confirmación de pedido...'}
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          disabled={aiGenerating}
                          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60 resize-none leading-relaxed"
                        />
                        <button
                          type="button"
                          onClick={handleGenerateAI}
                          disabled={aiGenerating || !aiPrompt.trim()}
                          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition disabled:opacity-50"
                        >
                          {aiGenerating
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generando…</>
                            : aiDone
                              ? <><RefreshCw size={14} /> Regenerar</>
                              : <><Sparkles size={14} /> Generar plantilla</>
                          }
                        </button>
                      </div>

                      {(aiGenerating || aiResult) && (
                        <div className="rounded-lg border border-violet-100 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/30 p-3">
                          <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-1.5 flex items-center gap-1">
                            <Sparkles size={11} />
                            {aiGenerating ? 'Generando…' : 'Resultado'}
                          </p>
                          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed min-h-[5rem]">
                            {aiResult}
                            {aiGenerating && <span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5 align-text-bottom" />}
                          </p>
                          {aiDone && aiResult && (
                            <button
                              type="button"
                              onClick={applyAIResult}
                              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition"
                            >
                              <Check size={13} /> Usar este texto
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

              <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex gap-3 flex-shrink-0">
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-1 ${ac.bg} ${ac.hover} text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition disabled:opacity-60`}
                >
                  {saving
                    ? <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    : editingId ? <><Check size={16} /> Guardar cambios</> : <><Plus size={16} /> Guardar plantilla</>
                  }
                </button>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="px-5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm font-semibold transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
