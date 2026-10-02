'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { normalizePhone } from '@/lib/phone'
import { useSession } from '@/lib/profile'
import { REMINDER_TYPES, REMINDER_TYPE_INFO, remTypeInfo, reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { MESES, QUICK_WHEN, fmtDue, isSameDay, quickDate, toDbLocal, type QuickWhen } from '@/lib/datetime'

type LeadContact = { id: string; name: string; phone?: string; email?: string }

/* ══════════════════════════════════════════════════════════
   ICONOS SVG
══════════════════════════════════════════════════════════ */
const Ico = {
  plus:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="m5 13 4 4L19 7"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  edit:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  lead:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  user:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  phone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 13, height: 13 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  mail:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  snooze:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/></svg>,
}

function fmtCompletado(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

/* ══════════════════════════════════════════════════════════
   POSPONER
══════════════════════════════════════════════════════════ */
function SnoozeMenu({ onPick }: { onPick: (when: QuickWhen) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="snooze" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Posponer" aria-label="Posponer" aria-expanded={open} className="icon-btn icon-btn-edit"><Ico.snooze /></button>
      {open && (
        <div className="snooze-menu" role="menu">
          <div className="snooze-title">Posponer a…</div>
          {QUICK_WHEN.map(w => (
            <button key={w.key} role="menuitem" onClick={() => { setOpen(false); onPick(w.key) }}>{w.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TARJETA DE RECORDATORIO
══════════════════════════════════════════════════════════ */
function RemCard({ r, accent, contact, readonly, onComplete, onDelete, onSnooze }: {
  r: Reminder; accent: string; contact?: LeadContact; readonly: boolean
  onComplete?: () => void
  onDelete:    () => void
  onSnooze?:   (when: QuickWhen) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const typeInfo = remTypeInfo(r.type)
  const isHigh   = r.priority === 'high'
  const subject  = reminderSubject(r)
  const phone    = normalizePhone(contact?.phone)

  return (
    <div className={`rem-card ${isHigh ? 'high' : ''} ${r.completado ? 'done' : ''}`}>
      <div className="rem-card-bar" style={{ background: accent }} />

      <div className="rem-card-body">
        <div className="rem-card-tags">
          <span className="rem-type" style={{ color: typeInfo.color, background: typeInfo.bg }}>{typeInfo.emoji} {typeInfo.label}</span>
          {isHigh && <span className="rem-type" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>Alta</span>}
        </div>

        <div className="rem-card-title">{reminderTitle(r)}</div>

        {subject && (r.lead_id
          ? <Link href={`/leads?id=${r.lead_id}`} className="rem-subject lead"><Ico.lead /> {subject}</Link>
          : <span className="rem-subject"><Ico.user /> {subject}</span>)}

        {!r.completado ? (
          <div className="rem-card-when" style={{ color: accent }}><Ico.clock /> {fmtDue(r.fecha_recordatorio)}</div>
        ) : (
          <div className="rem-card-when muted">Completado {fmtCompletado(r.completado_at)}</div>
        )}
      </div>

      <div className="rem-card-actions">
        {confirmDel ? (
          <div className="rem-card-confirm">
            <button onClick={() => { onDelete(); setConfirmDel(false) }} className="btn btn-danger">Sí, borrar</button>
            <button onClick={() => setConfirmDel(false)} className="btn btn-ghost">Cancelar</button>
          </div>
        ) : (
          <>
            <div className="rem-card-icons">
              {phone && <a href={`tel:${phone}`} title="Llamar" className="icon-btn icon-btn-call"><Ico.phone /></a>}
              {phone.length === 10 && <Link href={`/whatsapp?phone=${phone}`} title="Abrir chat de WhatsApp" className="icon-btn icon-btn-whatsapp"><Ico.whatsapp /></Link>}
              {contact?.email && <a href={`mailto:${contact.email}`} title="Correo" className="icon-btn icon-btn-mail"><Ico.mail /></a>}
              {!readonly && !r.completado && onSnooze && <SnoozeMenu onPick={onSnooze} />}
              {!readonly && !r.completado && (
                <button onClick={() => openQuickCreate({ kind: 'reminder', reminder: r })} title="Editar" className="icon-btn icon-btn-edit"><Ico.edit /></button>
              )}
              {!readonly && <button onClick={() => setConfirmDel(true)} title="Eliminar" className="icon-btn icon-btn-delete"><Ico.trash /></button>}
            </div>
            {!readonly && onComplete && (
              <button onClick={onComplete} className="rem-done-btn"><Ico.check /> Listo</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Grupo con encabezado ── */
function RemGroup({ label, color, items, contactsById, readonly, onComplete, onDelete, onSnooze }: {
  label: string; color: string; items: Reminder[]; contactsById: Map<string, LeadContact>; readonly: boolean
  onComplete: (id: string) => void; onDelete: (id: string) => void; onSnooze: (r: Reminder, when: QuickWhen) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="rem-group">
      <div className="rem-group-head">
        <span className="rem-group-dot" style={{ background: color }} />
        <span className="rem-group-label" style={{ color }}>{label}</span>
        <span className="rem-group-count">{items.length}</span>
      </div>
      <div className="rem-group-list">
        {items.map(r => (
          <RemCard key={r.id} r={r} accent={color} readonly={readonly}
            contact={r.lead_id ? contactsById.get(r.lead_id) : undefined}
            onComplete={() => onComplete(r.id)} onDelete={() => onDelete(r.id)} onSnooze={when => onSnooze(r, when)} />
        ))}
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════
   AGENDA
══════════════════════════════════════════════════════════ */
export default function AgendaPage() {
  const session  = useSession()
  const readonly = session?.store?.access === 'readonly'
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [leads,     setLeads]     = useState<LeadContact[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'pending' | 'done'>('pending')
  const [typeFilter,setTypeFilter]= useState<string>('all')
  const [toast,     setToast]     = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    try {
      const [remRes, leadsRes] = await Promise.all([fetch('/api/data/reminders'), fetch('/api/data/leads')])
      const remData   = await remRes.json()
      const leadsData = await leadsRes.json()
      setReminders(remData.reminders || [])
      setLeads((leadsData.leads || []).map((l: any) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email })))
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useDataChanged(['reminder', 'lead'], load)

  const mutate = async (url: string, init: RequestInit, okMsg: string) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null)
    if (!r?.ok) {
      const d = await r?.json().catch(() => ({}))
      showToast(d?.error || 'No se pudo guardar. Intenta de nuevo.')
      return false
    }
    showToast(okMsg)
    notifyDataChanged('reminder')
    return true
  }

  const handleComplete = (id: string) =>
    mutate(`/api/data/reminders/${id}`, { method: 'PATCH', body: JSON.stringify({ completado: true }) }, '¡Listo!')
  const handleDelete = (id: string) =>
    mutate(`/api/data/reminders/${id}`, { method: 'DELETE' }, 'Recordatorio eliminado')
  const handleSnooze = (r: Reminder, when: QuickWhen) =>
    mutate(`/api/data/reminders/${r.id}`, { method: 'PATCH', body: JSON.stringify({ fecha_recordatorio: toDbLocal(quickDate(when)) }) },
      `Pospuesto: ${QUICK_WHEN.find(w => w.key === when)?.label.toLowerCase()}`)

  /* Filtrado */
  const now     = new Date()
  const pending = reminders.filter(r => !r.completado).sort((a, b) => a.fecha_recordatorio.localeCompare(b.fecha_recordatorio))
  const done    = reminders.filter(r =>  r.completado).sort((a, b) => String(b.completado_at || b.created_at).localeCompare(String(a.completado_at || a.created_at)))
  const applyTypeFilter = (list: Reminder[]) => typeFilter === 'all' ? list : list.filter(r => (r.type || 'task') === typeFilter)
  const contactsById = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])

  const pendingF = applyTypeFilter(pending)
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const overdue  = pendingF.filter(r => new Date(r.fecha_recordatorio) < now)
  const todayRem = pendingF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && isSameDay(d, now) })
  const tomorrowRem = pendingF.filter(r => isSameDay(new Date(r.fecha_recordatorio), tomorrow))
  const later    = pendingF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && !isSameDay(d, now) && !isSameDay(d, tomorrow) })
  const doneF    = applyTypeFilter(done)
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of (tab === 'pending' ? pending : done)) m.set(r.type || 'task', (m.get(r.type || 'task') ?? 0) + 1)
    return m
  }, [tab, pending, done])

  const groupProps = { contactsById, readonly, onComplete: handleComplete, onDelete: handleDelete, onSnooze: handleSnooze }

  return (
    <>
      <div className="section-head">
        <h2>Agenda</h2>
        {pending.length > 0 && (
          <span className="count">{overdue.length ? `${overdue.length} vencido${overdue.length !== 1 ? 's' : ''} · ` : ''}{pending.length} pendiente{pending.length !== 1 ? 's' : ''}</span>
        )}
        {!readonly && (
          <div className="section-actions">
            <button className="btn btn-primary page-primary" onClick={() => openQuickCreate({ kind: 'reminder' })}>
              <Ico.plus /> Nuevo recordatorio
            </button>
          </div>
        )}
      </div>

      <div className="status-tabs" role="tablist" aria-label="Recordatorios">
        {([{ key: 'pending', label: 'Pendientes', count: pending.length }, { key: 'done', label: 'Completados', count: done.length }] as const).map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`status-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{!loading && <span className="status-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <button className={`filter-pill ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>Todos</button>
        {REMINDER_TYPES.filter(t => typeCounts.has(t) || typeFilter === t).map(t => (
          <button key={t} className={`filter-pill ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
            {REMINDER_TYPE_INFO[t].emoji} {REMINDER_TYPE_INFO[t].label}
            <span className="count">{typeCounts.get(t) ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : tab === 'pending' ? (
        pendingF.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.5 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: 'var(--ink)' }}>
              {typeFilter === 'all' ? 'Todo al día' : `Sin pendientes de tipo "${remTypeInfo(typeFilter).label}"`}
            </div>
            {!readonly && <div>Programa llamadas, visitas o tareas con <button className="link-btn" onClick={() => openQuickCreate({ kind: 'reminder' })}>Nuevo recordatorio</button>.</div>}
          </div>
        ) : (
          <>
            <RemGroup label="Vencidos" color="var(--danger)" items={overdue} {...groupProps} />
            <RemGroup label="Hoy" color="var(--brand)" items={todayRem} {...groupProps} />
            <RemGroup label="Mañana" color="var(--warning)" items={tomorrowRem} {...groupProps} />
            <RemGroup label="Más adelante" color="var(--c-cyan-ink)" items={later} {...groupProps} />
          </>
        )
      ) : (
        doneF.length === 0 ? (
          <div className="empty-state">Sin recordatorios completados aún.</div>
        ) : (
          <div className="rem-group-list">
            {doneF.map(r => (
              <RemCard key={r.id} r={r} accent="var(--muted-2)" readonly={readonly}
                contact={r.lead_id ? contactsById.get(r.lead_id) : undefined} onDelete={() => handleDelete(r.id)} />
            ))}
          </div>
        )
      )}

      {toast && (
        <div className="toast-fixed">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--warning-fill)' }}><path d="m5 13 4 4L19 7"/></svg>
          {toast}
        </div>
      )}
    </>
  )
}
