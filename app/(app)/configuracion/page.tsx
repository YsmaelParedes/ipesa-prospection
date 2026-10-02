'use client'

import { useEffect, useState, useCallback } from 'react'
import { getUserRole } from '@/lib/profile'

/* ── Iconos ── */
const Ico = {
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  tag:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M12 2H2v10l10 10 10-10L12 2z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
  channel: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  users:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
}

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

type ConfigItem = { id: string; type: string; label: string; created_at: string }

const CHIP_PALETTES = [
  { bg: '#FFE9EC', color: '#C2071E' }, { bg: '#FCE6F2', color: '#A80F60' },
  { bg: '#DFF6FB', color: '#006E87' }, { bg: '#E0F6F1', color: '#0F7462' },
  { bg: '#E5F6E9', color: '#1E7A3C' }, { bg: '#FFF4D4', color: '#8A5F00' },
  { bg: '#F6E4EE', color: '#861456' },
]
function chipColor(label: string) {
  let h = 5381
  for (let i = 0; i < label.length; i++) h = ((h << 5) + h) ^ label.charCodeAt(i)
  return CHIP_PALETTES[Math.abs(h) % CHIP_PALETTES.length]
}

/* ── Sección genérica de config ── */
function ConfigSection({ title, icon, type, description, canEdit }: {
  title: string; icon: React.ReactNode; type: 'segment' | 'canal'; description: string; canEdit: boolean
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
    const r = await fetch(`/api/data/config/${id}`, { method: 'DELETE' })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(d.error || 'No se pudo eliminar')
    } else {
      showToast(`"${label}" eliminado`)
    }
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
                {!canEdit ? null : confirmDel === item.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>¿Eliminar?</span>
                    <button onClick={() => handleDelete(item.id, item.label)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--ipesa-rose)', background: 'var(--ipesa-rose-soft)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Sí</button>
                    <button onClick={() => setConfirmDel(null)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDel(item.id)} title="Eliminar"
                    className="icon-btn icon-btn-delete" style={{ marginLeft: 'auto' }}>
                    <Ico.trash />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!canEdit ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', background: 'var(--paper)', borderRadius: 10, padding: '10px 12px' }}>
          Solo un administrador puede agregar o quitar opciones (afectan a todo el equipo).
        </div>
      ) : (
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
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)', marginTop: 6 }}>{error}</div>}
      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </div>
  )
}

/* ── Sección: Usuarios y roles (solo admin) ── */
type AppUser = { id: string; email: string; display_name: string; role: 'admin' | 'employee' }

function UsersSection() {
  const [users,   setUsers]   = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [toast,   setToast]   = useState('')
  const [savingId, setSavingId]   = useState<string | null>(null)
  // Usuario para el que se está confirmando un cambio de rol
  const [pendingChange, setPendingChange] = useState<{ id: string; newRole: 'admin' | 'employee' } | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/users')
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setUsers(d.users || [])
    } catch { setError('Error al cargar usuarios') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const confirmRoleChange = async () => {
    if (!pendingChange) return
    const { id: userId, newRole } = pendingChange
    setSavingId(userId); setError(''); setPendingChange(null)
    try {
      const r = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      showToast('Rol actualizado ✓')
      await load()
    } catch { setError('Error al actualizar rol') } finally { setSavingId(null) }
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--ipesa-orange-soft)',
          color: 'var(--ipesa-orange)', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}><Ico.users /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Usuarios y roles</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            Un administrador ve y supervisa los leads de todos los usuarios
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {users.map(u => {
            const isPending = pendingChange?.id === u.id
            return (
              <div key={u.id} style={{
                padding: '10px 14px', background: 'var(--card)',
                border: `1px solid ${isPending ? 'var(--ipesa-orange)' : 'var(--line)'}`, borderRadius: 10,
              }}>
                <div className="user-row-head">
                  <div className="user-row-name">
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{u.display_name || u.email}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  </div>
                  <span className="role-badge" style={{
                    fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: '4px 10px',
                    color: u.role === 'admin' ? 'var(--ipesa-blue)' : 'var(--muted)',
                    background: u.role === 'admin' ? 'var(--ipesa-blue-soft)' : 'var(--paper)',
                    border: u.role === 'admin' ? 'none' : '1px solid var(--line)',
                    whiteSpace: 'nowrap',
                  }}>
                    {u.role === 'admin' ? '🛡 Administrador' : 'Empleado'}
                  </span>
                  {!isPending && (
                    <button
                      className="change-role-btn"
                      disabled={savingId === u.id}
                      onClick={() => setPendingChange({ id: u.id, newRole: u.role === 'admin' ? 'employee' : 'admin' })}
                      style={{
                        padding: '5px 10px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
                        background: 'none', border: '1px solid var(--line)', borderRadius: 7,
                        cursor: savingId === u.id ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                      }}>
                      Cambiar rol
                    </button>
                  )}
                </div>
                {isPending && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 8 }}>
                      {pendingChange!.newRole === 'admin'
                        ? <>¿Convertir a <strong>{u.display_name || u.email}</strong> en <strong>administrador</strong>? Podrá ver, editar y eliminar los leads de todos los usuarios.</>
                        : <>¿Quitar el rol de administrador a <strong>{u.display_name || u.email}</strong>? Dejará de ver los leads de otros usuarios.</>}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={confirmRoleChange}
                        style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'var(--ipesa-orange)', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                        Sí, confirmar
                      </button>
                      <button onClick={() => setPendingChange(null)}
                        style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)', marginTop: 10 }}>{error}</div>}
      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </div>
  )
}

/* ── Estado de la integración con WhatsApp (solo admin) ── */
type WaStatus = {
  config: Record<string, boolean>
  health: { displayPhoneNumber?: string; verifiedName?: string; qualityRating?: string; messagingLimitTier?: string; nameStatus?: string } | null
  graphVersion: string
}

const STATUS_ITEMS: { key: string; label: string; help: string; critical?: boolean }[] = [
  { key: 'accessToken',     label: 'Token de acceso',        help: 'WHATSAPP_ACCESS_TOKEN — permite enviar mensajes', critical: true },
  { key: 'phoneNumberId',   label: 'Número emisor',          help: 'WHATSAPP_PHONE_NUMBER_ID', critical: true },
  { key: 'businessAccount', label: 'Cuenta de WhatsApp Business', help: 'WHATSAPP_BUSINESS_ACCOUNT_ID — plantillas en vivo y calidad del número' },
  { key: 'appSecret',       label: 'Firma del webhook',      help: 'WHATSAPP_APP_SECRET — sin esto no se verifica que los mensajes entrantes vengan de Meta', critical: true },
  { key: 'verifyToken',     label: 'Token de verificación',  help: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN — solo para registrar el webhook en Meta' },
  { key: 'vapid',           label: 'Notificaciones push',    help: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY' },
  { key: 'cronSecret',      label: 'Recordatorios automáticos', help: 'CRON_SECRET — protege el aviso diario de recordatorios' },
]

function WhatsAppStatusSection() {
  const [data, setData] = useState<WaStatus | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/whatsapp/status').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d) })
      .catch(e => setError(e?.message || 'No se pudo consultar el estado'))
  }, [])

  const quality: Record<string, string> = { GREEN: '🟢 Alta', YELLOW: '🟡 Media', RED: '🔴 Baja', UNKNOWN: '⚪ Sin datos' }

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionHeader icon={<Ico.whatsapp />} title="Estado de la integración" subtitle="Variables configuradas en el servidor (sin mostrar valores) y salud del número en Meta" green />
      {error && <div style={{ fontSize: 12.5, color: 'var(--ipesa-rose)' }}>{error}</div>}
      {!data && !error && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Consultando…</div>}
      {data && (
        <>
          {data.health && (
            <div className="kv-grid" style={{ marginBottom: 12 }}>
              <div className="kv"><div className="k">Número</div><div className="v">{data.health.displayPhoneNumber || '—'}</div></div>
              <div className="kv"><div className="k">Nombre verificado</div><div className="v">{data.health.verifiedName || '—'}</div></div>
              <div className="kv"><div className="k">Calidad</div><div className="v">{quality[data.health.qualityRating ?? 'UNKNOWN'] ?? data.health.qualityRating}</div></div>
              <div className="kv"><div className="k">Nivel de mensajería</div><div className="v">{data.health.messagingLimitTier?.replace('TIER_', '') ?? '—'}</div></div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STATUS_ITEMS.map(it => {
              const ok = !!data.config[it.key]
              return (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--card)', border: `1px solid ${!ok && it.critical ? '#F7C1C9' : 'var(--line)'}`, borderRadius: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, background: ok ? 'var(--ipesa-green-soft)' : it.critical ? 'var(--ipesa-rose-soft)' : 'var(--paper)', color: ok ? 'var(--ipesa-green)' : it.critical ? 'var(--ipesa-rose)' : 'var(--muted)' }}>
                    {ok ? '✓' : '!'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.label}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{it.help}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: ok ? 'var(--ipesa-green)' : it.critical ? 'var(--ipesa-rose)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {ok ? 'Configurado' : 'Falta'}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Graph API {data.graphVersion}. Las variables se configuran en Vercel → Settings → Environment Variables.</div>
        </>
      )}
    </div>
  )
}

function SectionHeader({ icon, title, subtitle, green }: { icon: React.ReactNode; title: string; subtitle: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ width: 38, height: 38, borderRadius: 10, background: green ? '#DCF5E3' : 'var(--ipesa-orange-soft)', color: green ? '#1B9E4B' : 'var(--ipesa-orange)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  )
}

/* ── Respuestas rápidas del chat (solo admin las administra; todos las usan) ── */
type QuickReply = { id: string; title: string; body: string }

function QuickRepliesSection() {
  const [items, setItems]     = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle]     = useState('')
  const [body, setBody]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/whatsapp/quick-replies')
      const d = await r.json()
      setItems(d.items ?? [])
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async () => {
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/whatsapp/quick-replies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || 'No se pudo guardar'); return }
      setTitle(''); setBody('')
      await load()
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    await fetch(`/api/whatsapp/quick-replies/${id}`, { method: 'DELETE' })
    setConfirmDel(null)
    await load()
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionHeader icon={<span style={{ fontSize: 16 }}>⚡</span>} title="Respuestas rápidas" subtitle="Mensajes frecuentes que el equipo inserta en el chat con un clic. Usa {nombre} para el nombre del cliente." />
      {loading ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Cargando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '18px 0', background: 'var(--paper)', borderRadius: 10 }}>
              Aún no hay respuestas rápidas. Ejemplos: «Horario», «Ubicación», «Formas de pago».
            </div>
          )}
          {items.map(q => (
            <div key={q.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{q.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{q.body}</div>
              </div>
              {confirmDel === q.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => remove(q.id)} style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--ipesa-rose)', background: 'var(--ipesa-rose-soft)', borderRadius: 6 }}>Sí</button>
                  <button onClick={() => setConfirmDel(null)} style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6 }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDel(q.id)} title="Eliminar" className="icon-btn icon-btn-delete"><Ico.trash /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60} placeholder="Título (ej. Horario)"
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }} />
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={1000} rows={3} placeholder="¡Hola {nombre}! Nuestro horario es de lunes a sábado de 9:00 a 19:00 h."
          style={{ padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)' }} />
        {error && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)' }}>{error}</div>}
        <button className="btn btn-primary" onClick={add} disabled={!title.trim() || !body.trim() || saving} style={{ alignSelf: 'flex-end' }}>
          <Ico.plus /> {saving ? 'Guardando…' : 'Agregar respuesta'}
        </button>
      </div>
    </div>
  )
}

/* ── Prueba de conexión con WhatsApp Cloud API ── */
function WhatsAppTestSection() {
  const [phone, setPhone]       = useState('')
  const [template, setTemplate] = useState('')
  const [language, setLanguage] = useState('es_MX')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [bodyParam, setBodyParam] = useState('')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  const canSend = /^\d{10,15}$/.test(phone) && template.trim().length > 0

  const handleTest = async () => {
    setSending(true); setResult(null)
    try {
      const r = await fetch('/api/whatsapp/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, template: template.trim(), language, headerImageUrl, bodyParam }),
      })
      const d = await r.json()
      if (r.ok) setResult({ ok: true, msg: `Enviado ✓ (id: ${d.messageId})` })
      else setResult({ ok: false, msg: d.error || 'Error al enviar' })
    } catch {
      setResult({ ok: false, msg: 'Error de red' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionHeader icon={<Ico.whatsapp />} title="Probar conexión de WhatsApp" subtitle="Envía una plantilla aprobada para confirmar que Meta quedó bien configurado" green />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
            Nombre exacto de la plantilla aprobada en Meta
          </label>
          <input
            value={template}
            onChange={e => { setTemplate(e.target.value); setResult(null) }}
            placeholder="ej. saludo_ipesa"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
            Idioma de la plantilla
          </label>
          <input
            value={language}
            onChange={e => { setLanguage(e.target.value); setResult(null) }}
            placeholder="es_MX"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
            Variable {'{{1}}'} del cuerpo <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional — ej. nombre del cliente)</span>
          </label>
          <input
            value={bodyParam}
            onChange={e => { setBodyParam(e.target.value); setResult(null) }}
            placeholder="Carlos"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
            URL de imagen de encabezado <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional — solo si la plantilla tiene encabezado de imagen)</span>
          </label>
          <input
            value={headerImageUrl}
            onChange={e => { setHeaderImageUrl(e.target.value); setResult(null) }}
            placeholder="https://…"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
            Número destino (con código de país, solo dígitos)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={phone}
              onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setResult(null) }}
              placeholder="5212221234567"
              style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }}
            />
            <button className="btn btn-primary" onClick={handleTest} disabled={!canSend || sending} style={{ flexShrink: 0 }}>
              {sending ? 'Enviando…' : 'Enviar prueba'}
            </button>
          </div>
        </div>
      </div>
      {result && (
        <div style={{ marginTop: 12, fontSize: 13, color: result.ok ? 'var(--ipesa-green)' : 'var(--ipesa-rose)', fontWeight: 600 }}>
          {result.msg}
        </div>
      )}
    </div>
  )
}

/* ── Página ── */
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'segment' | 'canal' | 'users' | 'whatsapp'>('segment')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => { getUserRole().then(r => setIsAdmin(r === 'admin')) }, [])

  const tabs = [
    { id: 'segment' as const, label: 'Segmentos',              icon: <Ico.tag /> },
    { id: 'canal'   as const, label: 'Canales de adquisición', icon: <Ico.channel /> },
    ...(isAdmin ? [{ id: 'users' as const, label: 'Usuarios', icon: <Ico.users /> }] : []),
    ...(isAdmin ? [{ id: 'whatsapp' as const, label: 'WhatsApp', icon: <Ico.whatsapp /> }] : []),
  ]

  return (
    <>
      <div className="section-head"><h2>Configuración</h2></div>

      <div className="config-tabs" style={{
        background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 11, padding: 4, marginBottom: 28,
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="config-tab-btn" style={{
            background: tab === t.id ? 'var(--ink)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--ink-2)',
          }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'segment' && (
        <ConfigSection key="segment" title="Segmentos" icon={<Ico.tag />} type="segment" canEdit={isAdmin}
          description="Tipos de cliente disponibles en formularios de contacto y leads" />
      )}
      {tab === 'canal' && (
        <ConfigSection key="canal" title="Canales de adquisición" icon={<Ico.channel />} type="canal" canEdit={isAdmin}
          description="Orígenes de contacto disponibles al registrar contactos y leads" />
      )}
      {tab === 'users' && isAdmin && <UsersSection key="users" />}
      {tab === 'whatsapp' && isAdmin && (
        <div key="whatsapp" style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <WhatsAppStatusSection />
          <QuickRepliesSection />
          <WhatsAppTestSection />
        </div>
      )}
    </>
  )
}
