'use client'

import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'
import { cachedQueryData, apiFetch } from '@/lib/apiClient'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useSession } from '@/lib/profile'
import { REMINDER_TYPES, REMINDER_TYPE_INFO, remTypeInfo, reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { MESES, QUICK_WHEN, isSameDay, pad, quickDate, toDbLocal, type QuickWhen } from '@/lib/datetime'
import { addDays, type CommercialContact } from '@/lib/commercial'
import { StatusChip } from '@/components/CommercialUI'
import s from './agenda.module.css'

/** GET /api/data/commercial/agenda: seguimientos del sistema comercial con su fecha. */
type CommercialData = { today: string; followUps: CommercialContact[] }
/** Un renglón de la Agenda: recordatorio o seguimiento comercial, ordenados juntos por fecha. */
type AgendaItem = { kind: 'rem'; r: Reminder; at: number } | { kind: 'com'; c: CommercialContact; at: number }
const COMMERCIAL_FILTER = 'commercial'

const Ico = {
  plus:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M12 5v14M5 12h14"/></svg>,
  check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m5 13 4 4L19 7"/></svg>,
  trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  edit:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  snooze:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3 2 6M22 6l-3-3"/></svg>,
  chevron: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={s.chev}><path d="m9 6 6 6-6 6"/></svg>,
}

/** El punto de color de cada tipo; el seguimiento comercial lleva el rojo de la marca. */
const COMMERCIAL_DOT = 'var(--brand)'
const typeDot = (type?: string | null) => remTypeInfo(type).color

const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const fmtShort = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`
const fmtDoneAt = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}
/** "domingo 1 de noviembre" para el encabezado del día. */
const dayName = (d: Date) => new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)

/* ── Posponer ── */
function SnoozeMenu({ onPick }: { onPick: (when: QuickWhen) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', click)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', click); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className={s.snooze} ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Posponer" aria-label="Posponer" aria-expanded={open}
        className={`${s.icon} ${s.press} ${open ? '' : s.quiet}`}><Ico.snooze /></button>
      {open && (
        <div className={s.snoozeMenu} role="menu">
          <div className={s.snoozeTitle}>Posponer a…</div>
          {QUICK_WHEN.map(w => (
            <button key={w.key} role="menuitem" className={s.press} onClick={() => { setOpen(false); onPick(w.key) }}>{w.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

/** La hora del renglón. Con showDate (vencidos y más adelante) lleva también el día. */
function When({ date, time, showDate }: { date: Date; time: string | null; showDate: boolean }) {
  if (!showDate) return <div className={s.when}>{time ?? 'Sin hora'}</div>
  return <div className={s.when}>{fmtShort(date)}<small>{time ?? 'Sin hora'}</small></div>
}

/* ── Recordatorio ── */
function RemRow({ r, overdue, showDate, readonly, onComplete, onDelete, onSnooze }: {
  r: Reminder; overdue: boolean; showDate: boolean; readonly: boolean
  onComplete?: () => void
  onDelete: () => void
  onSnooze?: (when: QuickWhen) => void
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const info = remTypeInfo(r.type)
  const subject = reminderSubject(r)
  const date = new Date(r.fecha_recordatorio)
  const title = reminderTitle(r)
  const canEdit = !readonly && !r.completado

  const meta = (
    <div className={s.meta}>
      <span className={s.kind}><i style={{ background: typeDot(r.type) }} />{info.label}</span>
      {subject && <><span className={s.sep} /><span>{subject}</span></>}
      {r.completado && <><span className={s.sep} /><span>Completado {fmtDoneAt(r.completado_at)}</span></>}
      {r.priority === 'high' && !r.completado && <span className={s.flag}>Alta</span>}
    </div>
  )

  return (
    <div className={`${s.row} ${overdue ? s.overdue : ''} ${r.completado ? s.doneRow : ''}`}>
      <When date={date} time={fmtTime(date)} showDate={showDate} />
      {canEdit ? (
        <button className={`${s.main} ${s.press}`} onClick={() => openQuickCreate({ kind: 'reminder', reminder: r })}>
          <span className={s.title}>{title}</span>
          {meta}
        </button>
      ) : (
        <div className={s.main}><span className={s.title}>{title}</span>{meta}</div>
      )}
      <div className={s.actions}>
        {confirmDel ? (
          <div className={s.confirm}>
            <button onClick={() => { onDelete(); setConfirmDel(false) }} className="btn btn-danger">Sí, borrar</button>
            <button onClick={() => setConfirmDel(false)} className="btn btn-ghost">Cancelar</button>
          </div>
        ) : (
          <>
            {canEdit && onSnooze && <SnoozeMenu onPick={onSnooze} />}
            {canEdit && (
              <button onClick={() => openQuickCreate({ kind: 'reminder', reminder: r })} title="Editar" aria-label="Editar"
                className={`${s.icon} ${s.quiet} ${s.press}`}><Ico.edit /></button>
            )}
            {!readonly && (
              <button onClick={() => setConfirmDel(true)} title="Eliminar" aria-label="Eliminar"
                className={`${s.icon} ${s.danger} ${s.quiet} ${s.press}`}><Ico.trash /></button>
            )}
            {!readonly && onComplete && (
              <button onClick={onComplete} className={`${s.doneBtn} ${s.press}`}><Ico.check /> Listo</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Seguimiento del sistema comercial: se registra ahí; aquí se ve en su día ── */
function FollowRow({ c, overdue, showDate }: { c: CommercialContact; overdue: boolean; showDate: boolean }) {
  const date = new Date(`${c.next_action_at}T12:00`)
  return (
    <div className={`${s.row} ${overdue ? s.overdue : ''}`}>
      <When date={date} time={null} showDate={showDate} />
      <Link href={`/comercial?id=${c.id}`} className={`${s.main} ${s.press}`}>
        <span className={s.title}>{c.next_action || 'Dar seguimiento'}</span>
        <span className={s.meta}>
          <span className={s.kind}><i style={{ background: COMMERCIAL_DOT }} />Sistema comercial</span>
          <span className={s.sep} /><span>{c.company?.trim() || c.name}</span>
          <StatusChip value={c.commercial_status} />
        </span>
      </Link>
      <div className={s.actions}><Ico.chevron /></div>
    </div>
  )
}

/* ── Grupo de un día ── */
function AgendaGroup({ label, overdue, showDate, items, readonly, onComplete, onDelete, onSnooze }: {
  label: string; overdue?: boolean; showDate?: boolean; items: AgendaItem[]; readonly: boolean
  onComplete: (id: string) => void; onDelete: (id: string) => void; onSnooze: (r: Reminder, when: QuickWhen) => void
}) {
  if (items.length === 0) return null
  return (
    <section className={s.group}>
      <div className={s.groupHead}>
        <span className={`${s.groupLabel} ${overdue ? s.overdueLabel : ''}`}>{label}</span>
        <span className={s.groupCount}>{items.length}</span>
        <span className={s.groupRule} />
      </div>
      <div className={s.list}>
        {items.map(it => it.kind === 'com' ? (
          <FollowRow key={`c-${it.c.id}`} c={it.c} overdue={!!overdue} showDate={!!showDate} />
        ) : (
          <RemRow key={it.r.id} r={it.r} overdue={!!overdue} showDate={!!showDate} readonly={readonly}
            onComplete={() => onComplete(it.r.id)} onDelete={() => onDelete(it.r.id)} onSnooze={when => onSnooze(it.r, when)} />
        ))}
      </div>
    </section>
  )
}

/* ══════════════ AGENDA ══════════════ */
export default function AgendaPage() {
  const session  = useSession()
  const readonly = session?.store?.access === 'readonly'
  const [reminders, setReminders] = useState<Reminder[]>(() => cachedQueryData('/api/data/reminders')?.reminders ?? [])
  const [commercial, setCommercial] = useState<CommercialData | null>(() => cachedQueryData('/api/data/commercial/agenda') ?? null)
  const [loading, setLoading] = useState(() => !cachedQueryData('/api/data/reminders'))
  useDataReady(loading, 'recordatorios')
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    try {
      const [remRes, comRes] = await Promise.all([apiFetch('/api/data/reminders'), apiFetch('/api/data/commercial/agenda')])
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
  // Seguimientos del sistema comercial: cada uno en el día que le toca (los míos y los sin asignar ya vencidos)
  const followUps = commercial?.followUps ?? []
  const comToday = commercial?.today ?? ''
  const comTomorrow = comToday ? addDays(comToday, 1) : ''

  const pendingF = applyTypeFilter(pending)
  const remsF    = typeFilter === COMMERCIAL_FILTER ? [] : pendingF
  const followF  = typeFilter === 'all' || typeFilter === COMMERCIAL_FILTER ? followUps : []
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  // Recordatorios (fecha y hora) y seguimientos (solo fecha) juntos, en orden
  const merge = (rems: Reminder[], coms: CommercialContact[]): AgendaItem[] => [
    ...rems.map(r => ({ kind: 'rem' as const, r, at: new Date(r.fecha_recordatorio).getTime() })),
    ...coms.map(c => ({ kind: 'com' as const, c, at: new Date(`${c.next_action_at}T00:00`).getTime() })),
  ].sort((a, b) => a.at - b.at)
  const comOn = (pred: (day: string) => boolean) => followF.filter(c => !!c.next_action_at && pred(c.next_action_at))
  const overdue  = merge(remsF.filter(r => new Date(r.fecha_recordatorio) < now), comOn(d => d < comToday))
  const todayRem = merge(remsF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && isSameDay(d, now) }), comOn(d => d === comToday))
  const tomorrowRem = merge(remsF.filter(r => isSameDay(new Date(r.fecha_recordatorio), tomorrow)), comOn(d => d === comTomorrow))
  const later    = merge(remsF.filter(r => { const d = new Date(r.fecha_recordatorio); return d >= now && !isSameDay(d, now) && !isSameDay(d, tomorrow) }), comOn(d => d > comTomorrow))
  const doneF    = applyTypeFilter(done)
  const pendingCount = pending.length + followUps.length
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of (tab === 'pending' ? pending : done)) m.set(r.type || 'task', (m.get(r.type || 'task') ?? 0) + 1)
    return m
  }, [tab, pending, done])

  const groupProps = { readonly, onComplete: handleComplete, onDelete: handleDelete, onSnooze: handleSnooze }

  return (
    <>
      <div className={s.head}>
        <h2>Agenda</h2>
        {pendingCount > 0 && (
          <span className={s.sum}>
            {overdue.length > 0 && <b>{overdue.length} vencido{overdue.length !== 1 ? 's' : ''}</b>}
            {overdue.length > 0 ? ' · ' : ''}{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
          </span>
        )}
        {!readonly && (
          <div className={s.headActions}>
            <button className="btn btn-primary page-primary" onClick={() => openQuickCreate({ kind: 'reminder' })}>
              <Ico.plus /> Nuevo recordatorio
            </button>
          </div>
        )}
      </div>

      <div className={s.controls}>
        <div className={s.seg} role="tablist" aria-label="Recordatorios">
          {([{ key: 'pending', label: 'Pendientes', count: pendingCount }, { key: 'done', label: 'Completados', count: done.length }] as const).map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={s.press} onClick={() => setTab(t.key)}>
              {t.label}{!loading && <span className={s.segN}>{t.count}</span>}
            </button>
          ))}
        </div>
        <div className={s.chips}>
          <button className={`${s.chip} ${s.press}`} aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>Todos</button>
          {tab === 'pending' && followUps.length > 0 && (
            <button className={`${s.chip} ${s.press}`} aria-pressed={typeFilter === COMMERCIAL_FILTER} onClick={() => setTypeFilter(COMMERCIAL_FILTER)}>
              Sistema comercial<span className={s.chipN}>{followUps.length}</span>
            </button>
          )}
          {REMINDER_TYPES.filter(t => typeCounts.has(t) || typeFilter === t).map(t => (
            <button key={t} className={`${s.chip} ${s.press}`} aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {REMINDER_TYPE_INFO[t].label}<span className={s.chipN}>{typeCounts.get(t) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : tab === 'pending' ? (
        remsF.length === 0 && followF.length === 0 ? (
          <div className={s.empty} style={{ marginTop: 26 }}>
            <div className={s.mark}><Ico.check /></div>
            <h3>{typeFilter === 'all' ? 'Todo al día' : typeFilter === COMMERCIAL_FILTER ? 'Sin seguimientos del sistema comercial' : `Sin pendientes de ${remTypeInfo(typeFilter).label.toLowerCase()}`}</h3>
            {!readonly && <p>Programa llamadas, visitas o tareas con <button className="link-btn" onClick={() => openQuickCreate({ kind: 'reminder' })}>Nuevo recordatorio</button>.</p>}
          </div>
        ) : (
          <>
            <AgendaGroup label="Vencidos" overdue showDate items={overdue} {...groupProps} />
            <AgendaGroup label={`Hoy · ${dayName(now)}`} items={todayRem} {...groupProps} />
            <AgendaGroup label={`Mañana · ${dayName(tomorrow)}`} items={tomorrowRem} {...groupProps} />
            <AgendaGroup label="Más adelante" showDate items={later} {...groupProps} />
          </>
        )
      ) : (
        doneF.length === 0 ? (
          <div className={s.empty} style={{ marginTop: 26 }}><p>Sin recordatorios completados aún.</p></div>
        ) : (
          <div className={s.list} style={{ marginTop: 26 }}>
            {doneF.map(r => (
              <RemRow key={r.id} r={r} overdue={false} showDate readonly={readonly} onDelete={() => handleDelete(r.id)} />
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
