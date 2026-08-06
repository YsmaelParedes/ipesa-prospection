'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

/* ══════════════════════════════════════════════════════════
   TIPOS Y CONSTANTES
══════════════════════════════════════════════════════════ */
type Reminder = {
  id: string
  lead_id: string | null
  lead_name: string
  nota: string
  fecha_recordatorio: string
  completado: boolean
  completado_at: string | null
  created_at: string
  type?: string
  priority?: string
}

type LeadContact = { id: string; name: string; phone?: string; email?: string }

function buildTelHref(phone: string) { return `tel:${phone.replace(/[^\d+]/g, '')}` }
function buildWhatsAppHref(phone: string) { return `https://wa.me/52${phone.replace(/\D/g, '')}` }
function buildMailHref(email: string) { return `mailto:${email}` }

const REM_TYPES = [
  { key: 'task',     label: 'Tarea',    emoji: '📋', color: '#4A2D8A', bg: '#E0D8F0' },
  { key: 'call',     label: 'Llamada',  emoji: '📞', color: '#1F3A5F', bg: '#DCE3EE' },
  { key: 'email',    label: 'Correo',   emoji: '📧', color: '#8A2F0A', bg: '#FBE6DA' },
  { key: 'whatsapp', label: 'WhatsApp', emoji: '💬', color: '#1F5536', bg: '#DBEADF' },
  { key: 'meeting',  label: 'Reunión',  emoji: '🤝', color: '#8A6308', bg: '#FBEED2' },
] as const

const PRIORITIES = [
  { key: 'low',    label: 'Baja',    color: 'var(--muted)',         bg: 'var(--paper)' },
  { key: 'medium', label: 'Media',   color: 'var(--ipesa-orange)',  bg: 'var(--ipesa-orange-soft)' },
  { key: 'high',   label: 'Alta',    color: 'var(--ipesa-rose)',    bg: 'var(--ipesa-rose-soft)' },
] as const

type RType    = typeof REM_TYPES[number]['key']
type Priority = typeof PRIORITIES[number]['key']

/* ══════════════════════════════════════════════════════════
   HELPERS DE FECHA
══════════════════════════════════════════════════════════ */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const pad   = (n: number) => String(n).padStart(2, '0')

function localNow()    { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }
function datetimeToISO(v: string) { return v + ':00' }

function dateShortcut(type: 'plus1h' | 'tomorrow9' | 'nextMonday9') {
  const d = new Date()
  if (type === 'plus1h') { d.setHours(d.getHours() + 1) }
  if (type === 'tomorrow9') { d.setDate(d.getDate() + 1); d.setHours(9, 0) }
  if (type === 'nextMonday9') { const diff = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + diff); d.setHours(9, 0) }
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isToday(d: Date)    { const n = new Date(); return d.toDateString() === n.toDateString() }
function isTomorrow(d: Date) { const n = new Date(); n.setDate(n.getDate()+1); return d.toDateString() === n.toDateString() }

function fmtLabel(iso: string) {
  const d    = new Date(iso)
  const now  = new Date()
  const diff = d.getTime() - now.getTime()
  const abs  = Math.abs(diff)
  const past = diff < 0
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  if (abs <= 45_000) return '¡Ahora!'

  const totalMins = Math.floor(abs / 60_000)
  const hours     = Math.floor(abs / 3_600_000)
  const remMins   = totalMins % 60

  // Menos de 60 minutos → "En 45 min"
  if (totalMins < 60) return past ? `Hace ${totalMins} min` : `En ${totalMins} min`

  // 1 a 6 horas → "En 1h 46min" / "Hace 2h 30min"
  if (hours < 6) {
    const label = remMins > 0 ? `${hours}h ${remMins}min` : `${hours}h`
    return past ? `Hace ${label}` : `En ${label}`
  }

  // Más de 6 horas → mostrar día y hora exacta
  if (isToday(d))    return `Hoy · ${time}`
  if (isTomorrow(d)) return `Mañana · ${time}`
  const days = Math.floor(abs / 86_400_000)
  if (past)          return `Hace ${days} día${days !== 1 ? 's' : ''} · ${time}`
  if (days < 7)      return `En ${days} día${days !== 1 ? 's' : ''} · ${time}`
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${time}`
}

function fmtCompletado(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

function getTypeInfo(key?: string) {
  return REM_TYPES.find(t => t.key === key) ?? REM_TYPES[0]
}

/* ══════════════════════════════════════════════════════════
   ICONOS SVG
══════════════════════════════════════════════════════════ */
const Ico = {
  plus:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="m5 13 4 4L19 7"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  edit:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  lead:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  search:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  phone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 13, height: 13 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  mail:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
}

/* ══════════════════════════════════════════════════════════
   MODAL — NUEVO / EDITAR RECORDATORIO
══════════════════════════════════════════════════════════ */
function ReminderModal({
  initial, leads, onSave, onClose,
}: {
  initial?: Partial<Reminder & { type: RType; priority: Priority }>
  leads: { id: string; name: string }[]
  onSave: (data: {
    nota: string; fecha_recordatorio: string
    type: RType; priority: Priority
    lead_id: string | null; lead_name: string
  }) => Promise<void>
  onClose: () => void
}) {
  const [rType,    setRType]    = useState<RType>    (initial?.type     ?? 'task')
  const [priority, setPriority] = useState<Priority> (initial?.priority ?? 'medium')
  const [fecha,    setFecha]    = useState(initial?.fecha_recordatorio?.slice(0,16) ?? '')
  const [nota,     setNota]     = useState(initial?.nota ?? '')
  const [leadId,   setLeadId]   = useState<string | null>(initial?.lead_id ?? null)
  const [leadName, setLeadName] = useState(initial?.lead_name ?? '')
  const [leadQ,    setLeadQ]    = useState('')
  const [saving,   setSaving]   = useState(false)

  const notaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setTimeout(() => notaRef.current?.focus(), 80) }, [])

  // Cerrar con Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const filteredLeads = leads.filter(l =>
    !leadQ || l.name.toLowerCase().includes(leadQ.toLowerCase())
  ).slice(0, 6)

  const canSave = nota.trim().length > 0 && fecha.length > 0

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    await onSave({
      nota: nota.trim(),
      fecha_recordatorio: datetimeToISO(fecha),
      type: rType,
      priority,
      lead_id: leadId,
      lead_name: leadId ? leadName : nota.trim(),
    })
    setSaving(false)
  }

  const S = {
    overlay: {
      position: 'fixed' as const, inset: 0, zIndex: 8000,
      background: 'rgba(20,16,12,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    },
    modal: {
      width: 'min(540px, 100%)', maxHeight: '90vh', overflowY: 'auto' as const,
      background: 'var(--card)', borderRadius: 18,
      boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
      padding: '28px 28px 24px',
    },
    label: {
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 8, display: 'block',
    },
    section: { marginBottom: 22 },
  }

  return (
    <div style={S.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* ── Cabecera ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              {initial?.id ? 'Editar recordatorio' : 'Nuevo recordatorio'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              Configura el tipo, prioridad y fecha
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Ico.close />
          </button>
        </div>

        {/* ── Tipo ── */}
        <div style={S.section}>
          <span style={S.label}>Tipo de recordatorio</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {REM_TYPES.map(t => (
              <button key={t.key} onClick={() => setRType(t.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: '2px solid',
                  borderColor: rType === t.key ? t.color : 'var(--line)',
                  background:  rType === t.key ? t.bg   : 'transparent',
                  color:       rType === t.key ? t.color : 'var(--ink-2)',
                  transition: 'all 0.12s',
                }}>
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Prioridad ── */}
        <div style={S.section}>
          <span style={S.label}>Prioridad</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRIORITIES.map(p => (
              <button key={p.key} onClick={() => setPriority(p.key)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: '2px solid',
                  borderColor: priority === p.key ? p.color : 'var(--line)',
                  background:  priority === p.key ? p.bg   : 'transparent',
                  color:       priority === p.key ? p.color : 'var(--ink-2)',
                  transition: 'all 0.12s',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Fecha y hora ── */}
        <div style={S.section}>
          <span style={S.label}>Fecha y hora</span>
          {/* Atajos rápidos */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { label: '+1 hora',       fn: () => dateShortcut('plus1h') },
              { label: 'Mañana 9am',    fn: () => dateShortcut('tomorrow9') },
              { label: 'Próx. lunes',   fn: () => dateShortcut('nextMonday9') },
            ].map(s => (
              <button key={s.label} onClick={() => setFecha(s.fn())}
                style={{
                  padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 20,
                  fontSize: 12, fontWeight: 600, color: 'var(--ipesa-orange)',
                  background: 'var(--ipesa-orange-soft)', cursor: 'pointer',
                }}>
                ⚡ {s.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={fecha}
            min={localNow()}
            onChange={e => setFecha(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
              borderRadius: 9, fontSize: 13.5, outline: 'none',
              background: 'var(--paper)', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── Descripción / nota ── */}
        <div style={S.section}>
          <span style={S.label}>Descripción</span>
          <textarea
            ref={notaRef}
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="¿Qué necesitas recordar?"
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
              borderRadius: 9, fontSize: 13.5, outline: 'none',
              background: 'var(--paper)', resize: 'vertical', minHeight: 72,
              fontFamily: 'var(--font-body)', lineHeight: 1.5, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* ── Lead asociado (opcional) ── */}
        <div style={S.section}>
          <span style={S.label}>Lead asociado <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></span>
          {leadId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid var(--ipesa-blue)', borderRadius: 9, background: 'var(--ipesa-blue-soft)' }}>
              <Ico.lead />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ipesa-blue)' }}>{leadName}</span>
              <button onClick={() => { setLeadId(null); setLeadName(''); setLeadQ('') }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}>
                ×
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <Ico.search />
              </div>
              <input
                value={leadQ}
                onChange={e => setLeadQ(e.target.value)}
                placeholder="Buscar lead por nombre…"
                style={{
                  width: '100%', padding: '9px 12px 9px 32px', border: '1px solid var(--line)',
                  borderRadius: 9, fontSize: 13, outline: 'none',
                  background: 'var(--paper)', boxSizing: 'border-box',
                }}
              />
              {leadQ && filteredLeads.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: 'var(--card)', border: '1px solid var(--line)',
                  borderRadius: 9, boxShadow: 'var(--shadow-md)', overflow: 'hidden', marginTop: 4,
                }}>
                  {filteredLeads.map(l => (
                    <button key={l.id} onClick={() => { setLeadId(l.id); setLeadName(l.name); setLeadQ('') }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 14px', border: 'none', background: 'none',
                        cursor: 'pointer', fontSize: 13, color: 'var(--ink)',
                        borderBottom: '1px solid var(--line)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Acciones ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '11px 0', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer', background: 'none' }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="btn btn-primary"
            style={{ flex: 2, padding: '11px 0', fontSize: 13.5, justifyContent: 'center', opacity: (!canSave || saving) ? 0.55 : 1 }}>
            {saving
              ? <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.5)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }} /> Guardando…</>
              : <><Ico.check /> {initial?.id ? 'Guardar cambios' : 'Crear recordatorio'}</>
            }
          </button>
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TARJETA DE RECORDATORIO
══════════════════════════════════════════════════════════ */
function RemCard({
  r, accent, contact, onComplete, onDelete, onEdit,
}: {
  r: Reminder; accent: string; contact?: LeadContact
  onComplete?: () => void
  onDelete:    () => void
  onEdit?:     (r: Reminder) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const typeInfo = getTypeInfo(r.type)
  const isHigh   = r.priority === 'high'

  const title = r.nota || r.lead_name || 'Recordatorio'

  return (
    <div style={{
      display: 'flex', gap: 0, background: 'var(--card)',
      border: `1px solid ${isHigh ? '#FECACA' : 'var(--line)'}`,
      borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Barra lateral de color */}
      <div style={{ width: 4, background: accent, flexShrink: 0 }} />

      <div style={{ flex: 1, padding: '11px 14px', minWidth: 0 }}>
        {/* Cabecera: emoji tipo + prioridad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 14 }}>{typeInfo.emoji}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: typeInfo.color, background: typeInfo.bg, padding: '1px 7px', borderRadius: 20 }}>
            {typeInfo.label}
          </span>
          {isHigh && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ipesa-rose)', background: 'var(--ipesa-rose-soft)', padding: '1px 7px', borderRadius: 20, marginLeft: 2 }}>
              🔴 Alta
            </span>
          )}
        </div>

        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.35 }}>
          {title}
        </div>

        {r.lead_id && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ipesa-blue)', fontWeight: 600, background: 'var(--ipesa-blue-soft)', borderRadius: 20, padding: '2px 8px', marginBottom: 4 }}>
            <Ico.lead /> {r.lead_name}
          </div>
        )}

        {!r.completado ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: accent, fontWeight: 600 }}>
            <Ico.clock /> {fmtLabel(r.fecha_recordatorio)}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Completado {fmtCompletado(r.completado_at)}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', flexDirection: 'row', alignContent: 'center',
        justifyContent: 'flex-end', gap: 6, padding: '10px 12px', flexShrink: 0,
        borderLeft: '1px solid var(--line)', maxWidth: 116,
      }}>
        {confirmDel ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexBasis: '100%' }}>
            <button onClick={() => { onDelete(); setConfirmDel(false) }}
              style={{ padding: '6px 10px', fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--ipesa-rose)', border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Sí, borrar
            </button>
            <button onClick={() => setConfirmDel(false)}
              style={{ padding: '6px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            {contact?.phone && (
              <a href={buildTelHref(contact.phone)} title="Llamar" className="icon-btn icon-btn-call">
                <Ico.phone />
              </a>
            )}
            {contact?.phone && (
              <a href={buildWhatsAppHref(contact.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="icon-btn icon-btn-whatsapp">
                <Ico.whatsapp />
              </a>
            )}
            {contact?.email && (
              <a href={buildMailHref(contact.email)} title="Correo" className="icon-btn icon-btn-mail">
                <Ico.mail />
              </a>
            )}
            {onEdit && !r.completado && (
              <button onClick={() => onEdit(r)} title="Editar" className="icon-btn icon-btn-edit">
                <Ico.edit />
              </button>
            )}
            <button onClick={() => setConfirmDel(true)} title="Eliminar" className="icon-btn icon-btn-delete">
              <Ico.trash />
            </button>
            {onComplete && (
              <button onClick={onComplete}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 10px', fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--ipesa-green)', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', flexBasis: '100%', transition: 'transform 0.12s ease, background 0.12s ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#2E6E46')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--ipesa-green)')}>
                <Ico.check /> Listo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Grupo con encabezado ── */
function RemGroup({ label, color, icon, items, contactsById, onComplete, onDelete, onEdit }: {
  label: string; color: string; icon: string; items: Reminder[]; contactsById: Map<string, LeadContact>
  onComplete: (id: string) => void; onDelete: (id: string) => void; onEdit: (r: Reminder) => void
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 20, padding: '1px 7px' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(r => (
          <RemCard
            key={r.id}
            r={r}
            accent={color}
            contact={r.lead_id ? contactsById.get(r.lead_id) : undefined}
            onComplete={() => onComplete(r.id)}
            onDelete={() => onDelete(r.id)}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function RecordatoriosPage() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [leads,     setLeads]     = useState<LeadContact[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'pending' | 'done'>('pending')
  const [typeFilter,setTypeFilter]= useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [editRem,   setEditRem]   = useState<Reminder | null>(null)
  const [toast,     setToast]     = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [remRes, leadsRes] = await Promise.all([
        fetch('/api/data/reminders'),
        fetch('/api/data/leads'),
      ])
      const remData   = await remRes.json()
      const leadsData = await leadsRes.json()
      setReminders(remData.reminders || [])
      setLeads((leadsData.leads || []).map((l: any) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email })))
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  /* CRUD */
  const handleCreate = async (data: any) => {
    await fetch('/api/data/reminders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setShowModal(false)
    showToast('Recordatorio creado ✓')
    await load()
  }

  const handleEdit = async (data: any) => {
    if (!editRem) return
    await fetch(`/api/data/reminders/${editRem.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    })
    setEditRem(null)
    showToast('Recordatorio actualizado ✓')
    await load()
  }

  const handleComplete = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: true }),
    })
    showToast('¡Marcado como listo!')
    await load()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, { method: 'DELETE' })
    showToast('Eliminado')
    await load()
  }

  /* Filtrado */
  const now     = new Date()
  const pending = reminders.filter(r => !r.completado).sort((a, b) => new Date(a.fecha_recordatorio).getTime() - new Date(b.fecha_recordatorio).getTime())
  const done    = reminders.filter(r =>  r.completado).sort((a, b) => new Date(b.completado_at || b.created_at).getTime() - new Date(a.completado_at || a.created_at).getTime())

  const applyTypeFilter = (list: Reminder[]) =>
    typeFilter === 'all' ? list : list.filter(r => (r.type || 'task') === typeFilter)

  const contactsById = new Map(leads.map(l => [l.id, l]))

  const pendingF  = applyTypeFilter(pending)
  const overdue   = pendingF.filter(r => new Date(r.fecha_recordatorio) < now)
  const todayRem  = pendingF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && isToday(d) })
  const upcoming  = pendingF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && !isToday(d) })
  const doneF     = applyTypeFilter(done)

  return (
    <>
      {/* Encabezado */}
      <div className="section-head">
        <h2>Recordatorios</h2>
        {pending.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ipesa-orange)', background: 'var(--ipesa-orange-soft)', borderRadius: 20, padding: '3px 10px' }}>
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={() => { setEditRem(null); setShowModal(true) }}>
            <Ico.plus /> Nuevo recordatorio
          </button>
        </div>
      </div>

      {/* Controles: filtro de tipo + tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Filtro tipo */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={() => setTypeFilter('all')}
            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', borderColor: typeFilter === 'all' ? 'var(--ink)' : 'var(--line)', background: typeFilter === 'all' ? 'var(--ink)' : 'transparent', color: typeFilter === 'all' ? '#fff' : 'var(--ink-2)' }}>
            Todos
          </button>
          {REM_TYPES.map(t => (
            <button key={t.key} onClick={() => setTypeFilter(t.key)}
              style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '2px solid', borderColor: typeFilter === t.key ? t.color : 'var(--line)', background: typeFilter === t.key ? t.bg : 'transparent', color: typeFilter === t.key ? t.color : 'var(--ink-2)' }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 3 }}>
          {([{ key: 'pending', label: 'Pendientes', count: pending.length }, { key: 'done', label: 'Completados', count: done.length }] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === t.key ? 'var(--ink)' : 'transparent', color: tab === t.key ? '#fff' : 'var(--ink-2)', transition: 'all 0.15s' }}>
              {t.label}
              {t.count > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '1px 5px', background: tab === t.key ? 'rgba(255,255,255,0.18)' : 'var(--paper)', color: tab === t.key ? '#fff' : 'var(--muted)' }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>

      ) : tab === 'pending' ? (
        pendingF.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.5 }}>✅</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: 'var(--ink)' }}>
              {typeFilter === 'all' ? 'Todo al día' : `Sin recordatorios de tipo "${getTypeInfo(typeFilter).label}"`}
            </div>
            <div style={{ fontSize: 13 }}>Crea un nuevo recordatorio con el botón de arriba.</div>
          </div>
        ) : (
          <>
            <RemGroup label="Vencidos"  color="var(--ipesa-rose)"   icon="🔴" items={overdue}  contactsById={contactsById} onComplete={handleComplete} onDelete={handleDelete} onEdit={r => { setEditRem(r); setShowModal(true) }} />
            <RemGroup label="Hoy"       color="var(--ipesa-orange)" icon="🟡" items={todayRem} contactsById={contactsById} onComplete={handleComplete} onDelete={handleDelete} onEdit={r => { setEditRem(r); setShowModal(true) }} />
            <RemGroup label="Próximos"  color="var(--ipesa-blue)"   icon="🔵" items={upcoming} contactsById={contactsById} onComplete={handleComplete} onDelete={handleDelete} onEdit={r => { setEditRem(r); setShowModal(true) }} />
          </>
        )

      ) : (
        doneF.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--muted)', fontSize: 13 }}>Sin recordatorios completados aún.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneF.map(r => (
              <RemCard key={r.id} r={r} accent="var(--muted-2)" contact={r.lead_id ? contactsById.get(r.lead_id) : undefined} onDelete={() => handleDelete(r.id)} />
            ))}
          </div>
        )
      )}

      {/* Modal */}
      {(showModal || editRem) && (
        <ReminderModal
          key={editRem?.id ?? 'new'}
          initial={editRem ? { ...editRem, type: (editRem.type as RType) ?? 'task', priority: (editRem.priority as Priority) ?? 'medium' } : undefined}
          leads={leads}
          onSave={editRem ? handleEdit : handleCreate}
          onClose={() => { setShowModal(false); setEditRem(null) }}
        />
      )}

      {toast && (
        <div className="toast-fixed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>
          {toast}
        </div>
      )}
    </>
  )
}
