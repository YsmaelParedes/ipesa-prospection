'use client'

import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'


import { cachedQueryData, apiFetch } from '@/lib/apiClient'


import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/profile'
import { REMINDER_TYPES, REMINDER_TYPE_INFO, remTypeInfo, reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { MESES, QUICK_WHEN, fmtDue, isSameDay, quickDate, toDbLocal, type QuickWhen } from '@/lib/datetime'
import type { CommercialContact } from '@/lib/commercial'
import { StatusChip, nextLabel } from '@/components/CommercialUI'

/** Lo que trae /api/data/commercial (la lista de Hoy); aquí solo se usan los seguimientos con fecha. */
type CommercialData = { today: string; due: CommercialContact[] }

/* ══════════════════════════════════════════════════════════
   ICONOS SVG
══════════════════════════════════════════════════════════ */
const Ico = {
  plus:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="m5 13 4 4L19 7"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  edit:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  user:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
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
function RemCard({ r, accent, readonly, onComplete, onDelete, onSnooze }: {
  r: Reminder; accent: string; readonly: boolean
  onComplete?: () => void
  onDelete:    () => void
  onSnooze?:   (when: QuickWhen) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const typeInfo = remTypeInfo(r.type)
  const isHigh   = r.priority === 'high'
  const subject  = reminderSubject(r)

  return (
    <div className={`rem-card ${isHigh ? 'high' : ''} ${r.completado ? 'done' : ''}`}>
      <div className="rem-card-bar" style={{ background: accent }} />

      <div className="rem-card-body">
        <div className="rem-card-tags">
          <span className="rem-type" style={{ color: typeInfo.color, background: typeInfo.bg }}>{typeInfo.emoji} {typeInfo.label}</span>
          {isHigh && <span className="rem-type" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>Alta</span>}
        </div>

        <div className="rem-card-title">{reminderTitle(r)}</div>

        {subject && <span className="rem-subject"><Ico.user /> {subject}</span>}

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
function RemGroup({ label, color, items, readonly, onComplete, onDelete, onSnooze }: {
  label: string; color: string; items: Reminder[]; readonly: boolean
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
            onComplete={() => onComplete(r.id)} onDelete={() => onDelete(r.id)} onSnooze={when => onSnooze(r, when)} />
        ))}
      </div>
    </section>
  )
}

/* ── Seguimientos del sistema comercial (se registran ahí, aquí solo se ven) ── */
function CommercialFollowUps({ items, today }: { items: CommercialContact[]; today: string }) {
  if (items.length === 0) return null
  return (
    <section className="rem-group">
      <div className="rem-group-head">
        <span className="rem-group-dot" style={{ background: 'var(--brand)' }} />
        <span className="rem-group-label" style={{ color: 'var(--brand)' }}>Llamadas del sistema comercial</span>
        <span className="rem-group-count">{items.length}</span>
        <Link href="/comercial" className="link-btn" style={{ marginLeft: 'auto' }}>Ir a Hoy →</Link>
      </div>
      {items.slice(0, 8).map(c => {
        const next = nextLabel(c.next_action_at, today)
        return (
          <Link key={c.id} href={`/comercial?id=${c.id}`} className={`rem-row ${next.tone === 'overdue' ? 'overdue' : ''}`} style={{ textDecoration: 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="rem-row-when">{next.label}</div>
              <div className="rem-row-text">{c.next_action || 'Dar seguimiento'} · {c.company?.trim() || c.name}</div>
            </div>
            <StatusChip value={c.commercial_status} />
          </Link>
        )
      })}
      {items.length > 8 && <Link href="/comercial" className="link-btn">Ver las {items.length} en el sistema comercial →</Link>}
    </section>
  )
}

/* ══════════════════════════════════════════════════════════
   AGENDA
══════════════════════════════════════════════════════════ */
export default function AgendaPage() {
  const session  = useSession()
  const readonly = session?.store?.access === 'readonly'
  const [reminders, setReminders] = useState<Reminder[]>(() => cachedQueryData('/api/data/reminders')?.reminders ?? [])
  const [commercial, setCommercial] = useState<CommercialData | null>(() => cachedQueryData('/api/data/commercial') ?? null)
  const [loading,   setLoading]   = useState(() => !cachedQueryData('/api/data/reminders'))
  useDataReady(loading, 'recordatorios')
  const [tab,       setTab]       = useState<'pending' | 'done'>('pending')
  const [typeFilter,setTypeFilter]= useState<string>('all')
  const [toast,     setToast]     = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    try {
      const [remRes, comRes] = await Promise.all([apiFetch('/api/data/reminders'), apiFetch('/api/data/commercial')])
      const remData = await remRes.json()
      setReminders(remData.reminders || [])
      if (comRes.ok) setCommercial(await comRes.json())
    } catch {} finally { setLoading(false) }
  }, [])

  useQueryEffect(() => { load() }, [load])
  useDataChanged(['reminder', 'commercial'], load)

  const mutate = async (url: string, init: RequestInit, okMsg: string) => {
    const r = await apiFetch(url, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null)
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
  // Seguimientos del sistema comercial con fecha de hoy o vencida (los míos y los sin dueño con fecha)
  const followUps = useMemo(() => {
    if (!commercial?.due) return []
    return [...commercial.due].sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at)))
  }, [commercial])

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

  const groupProps = { readonly, onComplete: handleComplete, onDelete: handleDelete, onSnooze: handleSnooze }

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
        pendingF.length === 0 && followUps.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 34, marginBottom: 10, opacity: 0.5 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: 'var(--ink)' }}>
              {typeFilter === 'all' ? 'Todo al día' : `Sin pendientes de tipo "${remTypeInfo(typeFilter).label}"`}
            </div>
            {!readonly && <div>Programa llamadas, visitas o tareas con <button className="link-btn" onClick={() => openQuickCreate({ kind: 'reminder' })}>Nuevo recordatorio</button>.</div>}
          </div>
        ) : (
          <>
            <CommercialFollowUps items={followUps} today={commercial?.today ?? ''} />
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
              <RemCard key={r.id} r={r} accent="var(--muted-2)" readonly={readonly} onDelete={() => handleDelete(r.id)} />
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
