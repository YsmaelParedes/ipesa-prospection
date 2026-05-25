'use client'

import { useEffect, useState, useCallback } from 'react'

/* ── Iconos ── */
const Ico = {
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  tag:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M12 2H2v10l10 10 10-10L12 2z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
  channel: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  team:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  pencil:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
}

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

type ConfigItem = { id: string; type: string; label: string; created_at: string }

const CHIP_PALETTES = [
  { bg: '#FBE6DA', color: '#8A2F0A' }, { bg: '#DBEADF', color: '#1F5536' },
  { bg: '#DCE3EE', color: '#1F3A5F' }, { bg: '#FBEED2', color: '#8A6308' },
  { bg: '#F2DAEB', color: '#7B2A5D' }, { bg: '#DAEEDF', color: '#1B6634' },
  { bg: '#E0D8F0', color: '#4A2D8A' },
]
function chipColor(label: string) {
  let h = 5381
  for (let i = 0; i < label.length; i++) h = ((h << 5) + h) ^ label.charCodeAt(i)
  return CHIP_PALETTES[Math.abs(h) % CHIP_PALETTES.length]
}

function avatarColor(email: string) {
  const palette = ['#EE5A24', '#1F3A5F', '#3D8B5C', '#F2B544', '#B6589C', '#25A39A']
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

/* ── Sección Equipo ── */
type TeamUser = { id: string; email: string; display_name: string }

function EquipoSection() {
  const [users,   setUsers]   = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)   // userId editando
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState('')
  const [error,   setError]   = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/profiles')
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setUsers(d.users || [])
    } catch { setError('Error al cargar usuarios') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (u: TeamUser) => {
    setEditing(u.id)
    setDraft(u.display_name)
    setError('')
  }

  const cancelEdit = () => { setEditing(null); setDraft(''); setError('') }

  const saveEdit = async (userId: string, email: string) => {
    const name = draft.trim()
    if (!name) { setError('El nombre no puede estar vacío'); return }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/admin/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName: name }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); setSaving(false); return }
      setEditing(null)
      setDraft('')
      showToast(`Nombre de ${email.split('@')[0]} actualizado ✓`)
      // Notificar al AppShell para refrescar el sidebar
      window.dispatchEvent(new CustomEvent('ipesa:profile-updated'))
      await load()
    } catch { setError('Error al guardar') } finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--ipesa-orange-soft)',
          color: 'var(--ipesa-orange)', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}><Ico.team /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Equipo</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            Nombre visible en el sidebar y el saludo del Dashboard
          </div>
        </div>
        <span style={{
          marginLeft: 'auto', minWidth: 28, height: 22, borderRadius: 20,
          background: 'var(--paper)', border: '1px solid var(--line)',
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          display: 'grid', placeItems: 'center', padding: '0 8px',
        }}>{users.length}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
              No se encontraron usuarios
            </div>
          )}
          {users.map(u => {
            const bg   = avatarColor(u.email)
            const name = u.display_name || u.email.split('@')[0]
            const isEd = editing === u.id
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', background: 'var(--card)',
                border: `1px solid ${isEd ? 'var(--ipesa-orange)' : 'var(--line)'}`,
                borderRadius: 12, transition: 'border-color 0.15s',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: bg, color: '#fff',
                  display: 'grid', placeItems: 'center',
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
                }}>
                  {initials(name)}
                </div>

                {/* Info / editor */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEd ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={e => { setDraft(e.target.value); setError('') }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(u.id, u.email)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      placeholder="Nombre a mostrar…"
                      style={{
                        width: '100%', padding: '6px 10px',
                        border: '1px solid var(--ipesa-orange)', borderRadius: 7,
                        fontSize: 13.5, outline: 'none', background: 'var(--paper)',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{u.email}</div>
                    </>
                  )}
                </div>

                {/* Acciones */}
                {isEd ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => saveEdit(u.id, u.email)}
                      disabled={saving || !draft.trim()}
                      style={{
                        padding: '5px 12px', fontSize: 12.5, fontWeight: 700,
                        background: 'var(--ipesa-orange)', color: '#fff',
                        border: 'none', borderRadius: 7, cursor: 'pointer',
                        opacity: (saving || !draft.trim()) ? 0.5 : 1,
                      }}>
                      {saving ? '…' : 'Guardar'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: '5px 10px', fontSize: 12.5, fontWeight: 600,
                        background: 'var(--paper)', color: 'var(--muted)',
                        border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer',
                      }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(u)}
                    title="Editar nombre"
                    style={{
                      padding: 8, borderRadius: 7, color: 'var(--muted-2)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ipesa-orange)'; (e.currentTarget as HTMLElement).style.background = 'var(--ipesa-orange-soft)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted-2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    <Ico.pencil />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: 'var(--ipesa-rose)', marginTop: 10, padding: '6px 12px', background: 'var(--ipesa-rose-soft)', borderRadius: 7 }}>
          {error}
        </div>
      )}
      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </div>
  )
}

/* ── Sección genérica de config ── */
function ConfigSection({ title, icon, type, description }: {
  title: string; icon: React.ReactNode; type: 'segment' | 'canal'; description: string
}) {
  const [items, setItems]       = useState<ConfigItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/data/config?type=${type}`)
      const d = await r.json()
      setItems(d.items || [])
    } catch {} finally { setLoading(false) }
  }, [type])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const trimmed = newLabel.trim()
    if (!trimmed) return
    if (items.some(i => norm(i.label) === norm(trimmed))) {
      setError(`Ya existe "${trimmed}" (sin distinguir mayúsculas ni acentos)`)
      return
    }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/data/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, label: trimmed }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setNewLabel('')
      showToast(`"${trimmed}" agregado ✓`)
      await load()
    } catch { setError('Error al guardar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, label: string) => {
    await fetch(`/api/data/config/${id}`, { method: 'DELETE' })
    showToast(`"${label}" eliminado`)
    setConfirmDel(null)
    await load()
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--ipesa-orange-soft)',
          color: 'var(--ipesa-orange)', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{description}</div>
        </div>
        <span style={{
          marginLeft: 'auto', minWidth: 28, height: 22, borderRadius: 20,
          background: 'var(--paper)', border: '1px solid var(--line)',
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          display: 'grid', placeItems: 'center', padding: '0 8px',
        }}>{items.length}</span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0', background: 'var(--paper)', borderRadius: 10 }}>
              Sin {title.toLowerCase()} configurados aún
            </div>
          )}
          {items.map(item => {
            const { bg, color } = chipColor(item.label)
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: 'var(--card)',
                border: '1px solid var(--line)', borderRadius: 10,
              }}>
                <span className="chip" style={{ background: bg, color, fontSize: 12.5 }}>
                  <span className="chip-dot" style={{ background: color }} />
                  {item.label}
                </span>
                {confirmDel === item.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>¿Eliminar?</span>
                    <button onClick={() => handleDelete(item.id, item.label)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--ipesa-rose)', background: 'var(--ipesa-rose-soft)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Sí</button>
                    <button onClick={() => setConfirmDel(null)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDel(item.id)} title="Eliminar"
                    style={{ marginLeft: 'auto', padding: 6, borderRadius: 6, color: 'var(--muted-2)', background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ipesa-rose)'; (e.currentTarget as HTMLElement).style.background = 'var(--ipesa-rose-soft)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted-2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    <Ico.trash />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newLabel}
          onChange={e => { setNewLabel(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={`Nuevo ${title.slice(0, -1).toLowerCase()}…`}
          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', transition: 'border-color 0.15s' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--ipesa-orange)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
        <button className="btn btn-primary" onClick={handleAdd} disabled={!newLabel.trim() || saving} style={{ flexShrink: 0 }}>
          <Ico.plus /> {saving ? 'Guardando…' : 'Agregar'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)', marginTop: 6 }}>{error}</div>}
      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </div>
  )
}

/* ── Página ── */
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'equipo' | 'segment' | 'canal'>('equipo')

  const tabs = [
    { id: 'equipo'   as const, label: 'Equipo',                  icon: <Ico.team /> },
    { id: 'segment'  as const, label: 'Segmentos',               icon: <Ico.tag /> },
    { id: 'canal'    as const, label: 'Canales de adquisición',  icon: <Ico.channel /> },
  ]

  return (
    <>
      <div className="section-head"><h2>Configuración</h2></div>

      <div style={{
        display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 11, padding: 4, marginBottom: 28, width: 'fit-content',
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', border: 'none',
            background: tab === t.id ? 'var(--ink)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--ink-2)',
            transition: 'all 0.15s',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'equipo' && <EquipoSection key="equipo" />}
      {tab === 'segment' && (
        <ConfigSection key="segment" title="Segmentos" icon={<Ico.tag />} type="segment"
          description="Tipos de cliente disponibles en formularios de contacto y leads" />
      )}
      {tab === 'canal' && (
        <ConfigSection key="canal" title="Canales de adquisición" icon={<Ico.channel />} type="canal"
          description="Orígenes de contacto disponibles al registrar contactos y leads" />
      )}
    </>
  )
}
