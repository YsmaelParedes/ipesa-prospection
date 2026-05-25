'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

/* ── Iconos ── */
const Ico = {
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m5 13 4 4L19 7"/></svg>,
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  clock:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  lead:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  close:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  empty:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40 }}><circle cx="12" cy="12" r="10"/><path d="m5 13 4 4L19 7"/></svg>,
}

type Reminder = {
  id: string
  lead_id: string | null
  lead_name: string
  nota: string
  fecha_recordatorio: string
  completado: boolean
  completado_at: string | null
  created_at: string
}

/* ── Helpers de fecha ── */
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function isToday(d: Date) {
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function isTomorrow(d: Date) {
  const n = new Date(); n.setDate(n.getDate() + 1)
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

function fmtLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (isToday(d))    return `Hoy · ${fmtTime(iso)}`
  if (isTomorrow(d)) return `Mañana · ${fmtTime(iso)}`
  const diff = d.getTime() - now.getTime()
  if (diff < 0) {
    const days = Math.ceil(Math.abs(diff) / 86400000)
    return days === 1 ? `Ayer · ${fmtTime(iso)}` : `Hace ${days} días · ${fmtTime(iso)}`
  }
  const days = Math.floor(diff / 86400000)
  if (days < 7) return `En ${days} día${days !== 1 ? 's' : ''} · ${fmtTime(iso)}`
  return `${d.getDate()} ${MESES[d.getMonth()]} · ${fmtTime(iso)}`
}

function fmtCompletado(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

/* ── Tarjeta de recordatorio ── */
function RemCard({
  r, accent, onComplete, onDelete,
}: {
  r: Reminder; accent: string;
  onComplete?: () => void; onDelete: () => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false)
  const title = r.nota || r.lead_name || 'Recordatorio'
  const sub   = r.nota && r.lead_name && r.nota !== r.lead_name ? r.lead_name : null

  return (
    <div style={{
      display: 'flex', gap: 0,
      background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: 12, overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      transition: 'box-shadow 0.15s',
    }}>
      {/* Barra de color lateral */}
      <div style={{ width: 4, background: accent, flexShrink: 0 }} />

      {/* Contenido */}
      <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.35 }}>
          {title}
        </div>

        {/* Lead vinculado */}
        {r.lead_id && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: 'var(--ipesa-blue)', fontWeight: 600,
            background: 'var(--ipesa-blue-soft)', borderRadius: 20,
            padding: '2px 8px', marginBottom: 5,
          }}>
            <Ico.lead /> Lead: {sub || r.lead_name}
          </div>
        )}

        {/* Fecha */}
        {!r.completado ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: accent, fontWeight: 600,
          }}>
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
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        gap: 4, padding: '10px 12px', flexShrink: 0, borderLeft: '1px solid var(--line)',
      }}>
        {confirmDel ? (
          <>
            <button
              onClick={() => { onDelete(); setConfirmDel(false) }}
              style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--ipesa-rose)', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Sí, borrar
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            {onComplete && (
              <button
                onClick={onComplete}
                title="Marcar como completado"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', fontSize: 12, fontWeight: 600,
                  color: 'var(--ipesa-green)', background: 'var(--ipesa-green-soft)',
                  border: 'none', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                <Ico.check /> Listo
              </button>
            )}
            <button
              onClick={() => setConfirmDel(true)}
              title="Eliminar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                color: 'var(--muted)', background: 'none',
                border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer',
              }}>
              <Ico.trash />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ── Grupo con encabezado ── */
function RemGroup({ label, color, icon, items, onComplete, onDelete }: {
  label: string; color: string; icon: string;
  items: Reminder[];
  onComplete: (id: string) => void;
  onDelete:   (id: string) => void;
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color }}>{label}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          background: 'var(--paper)', border: '1px solid var(--line)',
          borderRadius: 20, padding: '1px 7px',
        }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(r => (
          <RemCard
            key={r.id}
            r={r}
            accent={color}
            onComplete={() => onComplete(r.id)}
            onDelete={() => onDelete(r.id)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Formulario inline de nuevo recordatorio ── */
function NuevoForm({ onSave, onCancel }: {
  onSave: (nota: string, fecha: string) => Promise<void>; onCancel: () => void
}) {
  const [nota, setNota]   = useState('')
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const minDate = new Date().toISOString().slice(0, 16)

  const handleSave = async () => {
    if (!nota.trim() || !fecha) return
    setSaving(true)
    await onSave(nota.trim(), fecha)
    setSaving(false)
  }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--ipesa-orange)',
      borderRadius: 14, padding: '18px 20px', marginBottom: 24,
      boxShadow: '0 0 0 3px var(--ipesa-orange-soft)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
        Nuevo recordatorio
      </div>
      <input
        ref={inputRef}
        value={nota}
        onChange={e => setNota(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        placeholder="¿Qué tienes que recordar?"
        style={{
          width: '100%', padding: '10px 12px', border: '1px solid var(--line)',
          borderRadius: 9, fontSize: 14, outline: 'none', background: 'var(--paper)',
          marginBottom: 10, boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <input
          type="datetime-local"
          value={fecha}
          onChange={e => setFecha(e.target.value)}
          min={minDate}
          style={{
            flex: 1, minWidth: 180, padding: '10px 12px', border: '1px solid var(--line)',
            borderRadius: 9, fontSize: 13.5, outline: 'none', background: 'var(--paper)',
          }}
        />
        <button
          onClick={onCancel}
          style={{ padding: '10px 16px', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13.5, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', background: 'none' }}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!nota.trim() || !fecha || saving}>
          <Ico.check /> {saving ? 'Guardando…' : 'Crear'}
        </button>
      </div>
    </div>
  )
}

/* ── Página principal ── */
export default function RecordatoriosPage() {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState<'pending' | 'done'>('pending')
  const [showForm, setShowForm]   = useState(false)
  const [toast, setToast]         = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/data/reminders')
      const d = await r.json()
      setReminders(d.reminders || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (nota: string, fecha: string) => {
    await fetch('/api/data/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: null,
        lead_name: nota,
        nota,
        fecha_recordatorio: new Date(fecha).toISOString(),
      }),
    })
    setShowForm(false)
    showToast('Recordatorio creado ✓')
    await load()
  }

  const handleComplete = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completado: true }),
    })
    showToast('¡Marcado como listo!')
    await load()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, { method: 'DELETE' })
    showToast('Eliminado')
    await load()
  }

  /* Clasificación */
  const now      = new Date()
  const pending  = reminders.filter(r => !r.completado).sort((a, b) => new Date(a.fecha_recordatorio).getTime() - new Date(b.fecha_recordatorio).getTime())
  const done     = reminders.filter(r =>  r.completado).sort((a, b) => new Date(b.completado_at || b.created_at).getTime() - new Date(a.completado_at || a.created_at).getTime())

  const overdue  = pending.filter(r => new Date(r.fecha_recordatorio) < now && !isToday(new Date(r.fecha_recordatorio)))
  const todayRem = pending.filter(r => isToday(new Date(r.fecha_recordatorio)))
  const upcoming = pending.filter(r => new Date(r.fecha_recordatorio) >= now && !isToday(new Date(r.fecha_recordatorio)))

  return (
    <>
      {/* Encabezado */}
      <div className="section-head">
        <h2>Recordatorios</h2>
        {pending.length > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 700, color: 'var(--ipesa-orange)',
            background: 'var(--ipesa-orange-soft)', borderRadius: 20,
            padding: '3px 10px',
          }}>
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="btn btn-primary"
            onClick={() => setShowForm(f => !f)}>
            {showForm ? <><Ico.close /> Cancelar</> : <><Ico.plus /> Nuevo recordatorio</>}
          </button>
        </div>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <NuevoForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 11, padding: 4, marginBottom: 24, width: 'fit-content',
      }}>
        {([
          { key: 'pending', label: 'Pendientes', count: pending.length },
          { key: 'done',    label: 'Completados', count: done.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: tab === t.key ? 'var(--ink)' : 'transparent',
              color:      tab === t.key ? '#fff' : 'var(--ink-2)',
              transition: 'all 0.15s',
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 6px',
                background: tab === t.key ? 'rgba(255,255,255,0.18)' : 'var(--paper)',
                color: tab === t.key ? '#fff' : 'var(--muted)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>

      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--muted)' }}>
            <div style={{ color: 'var(--ipesa-green)', marginBottom: 12, opacity: 0.6 }}><Ico.empty /></div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Todo al día</div>
            <div style={{ fontSize: 13 }}>No tienes recordatorios pendientes.<br/>Crea uno con el botón de arriba.</div>
          </div>
        ) : (
          <>
            <RemGroup
              label="Vencidos"
              color="var(--ipesa-rose)"
              icon="🔴"
              items={overdue}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
            <RemGroup
              label="Hoy"
              color="var(--ipesa-orange)"
              icon="🟡"
              items={todayRem}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
            <RemGroup
              label="Próximos"
              color="var(--ipesa-blue)"
              icon="🔵"
              items={upcoming}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          </>
        )

      ) : (
        done.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '52px 0', color: 'var(--muted)', fontSize: 13 }}>
            Sin recordatorios completados aún.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {done.map(r => (
              <RemCard
                key={r.id}
                r={r}
                accent="var(--muted-2)"
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        )
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
