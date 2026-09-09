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
                    className="icon-btn icon-btn-delete" style={{ marginLeft: 'auto' }}>
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

/* ── Prueba de conexión con WhatsApp Cloud API (temporal, hasta tener la sección de Campañas) ── */
function WhatsAppTestSection() {
  const [phone, setPhone]       = useState('')
  const [template, setTemplate] = useState('')
  const [language, setLanguage] = useState('es_MX')
  const [sending, setSending]   = useState(false)
  const [result, setResult]     = useState<{ ok: boolean; msg: string } | null>(null)

  const canSend = /^\d{10,15}$/.test(phone) && template.trim().length > 0

  const handleTest = async () => {
    setSending(true); setResult(null)
    try {
      const r = await fetch('/api/whatsapp/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, template: template.trim(), language }),
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
    <div style={{ maxWidth: 500 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, background: '#DCF5E3',
          color: '#1B9E4B', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}><Ico.whatsapp /></span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Probar conexión de WhatsApp</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            Envía una plantilla aprobada para confirmar que Meta quedó bien configurado
          </div>
        </div>
      </div>

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
        <ConfigSection key="segment" title="Segmentos" icon={<Ico.tag />} type="segment"
          description="Tipos de cliente disponibles en formularios de contacto y leads" />
      )}
      {tab === 'canal' && (
        <ConfigSection key="canal" title="Canales de adquisición" icon={<Ico.channel />} type="canal"
          description="Orígenes de contacto disponibles al registrar contactos y leads" />
      )}
      {tab === 'users' && isAdmin && <UsersSection key="users" />}
      {tab === 'whatsapp' && isAdmin && <WhatsAppTestSection key="whatsapp" />}
    </>
  )
}
