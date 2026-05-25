'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/* ── Helpers Push Notifications ─────────────────────────────────────────── */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output.buffer as ArrayBuffer
}

/* ── Iconos ── */
const Icon = {
  dashboard: (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>,
  contacts:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  leads:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  settings:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  bell:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
  menu:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 6h18M3 12h18M3 18h18"/></svg>,
  plus:      (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14"/></svg>,
  logout:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  search:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  clock:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  check:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m5 13 4 4L19 7"/></svg>,
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function fmtRem(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  const hrs  = Math.floor(diff / 3600000)
  const mins = Math.floor(diff / 60000)
  if (mins < -60 * 24)  return `Venció hace ${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''}`
  if (mins < -60)       return `Venció hace ${Math.abs(hrs)} h`
  if (mins < 0)         return `Venció hace ${Math.abs(mins)} min`
  if (mins < 60)        return `En ${mins} min`
  if (hrs < 24)         return `En ${hrs} h`
  if (days === 1)       return 'Mañana'
  return `${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]}`
}

const NAV_ITEMS = [
  { id: 'dashboard',      href: '/',                label: 'Dashboard',      icon: Icon.dashboard, mobile: true  },
  { id: 'contactos',      href: '/contactos',       label: 'Contactos',      icon: Icon.contacts,  mobile: true  },
  { id: 'leads',          href: '/leads',           label: 'Leads',          icon: Icon.leads,     mobile: true  },
  { id: 'recordatorios',  href: '/recordatorios',   label: 'Recordatorios',  icon: Icon.clock,     mobile: false },
  { id: 'configuracion',  href: '/configuracion',   label: 'Configuración',  icon: Icon.settings,  mobile: false },
]

const TITLE_MAP: Record<string, { t: string; s: string }> = {
  '/':               { t: 'Dashboard',         s: 'Resumen de actividad'             },
  '/contactos':      { t: 'Contactos',         s: 'Base de clientes registrados'     },
  '/leads':          { t: 'Pipeline de leads', s: 'Gestión de oportunidades'         },
  '/recordatorios':  { t: 'Recordatorios',     s: 'Seguimiento y tareas pendientes'  },
  '/configuracion':  { t: 'Configuración',     s: 'Segmentos y canales de la app'    },
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [displayName, setDisplayName] = useState('Staff')
  const [bellOpen,    setBellOpen]    = useState(false)
  const [reminders,   setReminders]   = useState<any[]>([])
  const [search,      setSearch]      = useState('')

  /* General reminder form inside bell panel */
  const [remForm,   setRemForm]   = useState(false)
  const [remFecha,  setRemFecha]  = useState('')
  const [remNota,   setRemNota]   = useState('')
  const [remSaving, setRemSaving] = useState(false)

  /* Push notifications */
  const [pushSupported,   setPushSupported]   = useState(false)
  const [pushSubscribed,  setPushSubscribed]  = useState(false)
  const [pushLoading,     setPushLoading]     = useState(false)
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null)

  const bellRef   = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  /* Display name */
  useEffect(() => {
    try { const s = localStorage.getItem('ipesa_display_name'); if (s) setDisplayName(s) } catch {}
  }, [])

  /* Registrar Service Worker + detectar estado de push */
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushSupported(true)

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      swRegRef.current = reg
      // Verificar si ya hay una suscripción activa
      reg.pushManager.getSubscription().then(sub => {
        setPushSubscribed(!!sub)
      })
    }).catch(err => console.warn('[SW]', err))
  }, [])

  /* Activar notificaciones push */
  const enablePush = async () => {
    if (!swRegRef.current) return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushLoading(false); return }

      const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!VAPID_KEY) throw new Error('VAPID key no configurada')

      const sub = await swRegRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      })

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setPushSubscribed(true)
    } catch (err) {
      console.error('[Push] Error al activar:', err)
    } finally {
      setPushLoading(false)
    }
  }

  /* Desactivar notificaciones push */
  const disablePush = async () => {
    if (!swRegRef.current) return
    setPushLoading(true)
    try {
      const sub = await swRegRef.current.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setPushSubscribed(false)
    } finally {
      setPushLoading(false)
    }
  }

  /* Load pending reminders */
  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch('/api/data/reminders')
      const d = await r.json()
      setReminders((d.reminders || []).filter((r: any) => !r.completado))
    } catch {}
  }, [])

  useEffect(() => {
    loadReminders()
    const t = setInterval(loadReminders, 60_000)
    return () => clearInterval(t)
  }, [loadReminders])

  /* Close bell on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
        setRemForm(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  /* Sync search → páginas escuchan ipesa:search */
  const dispatchSearch = (q: string) => {
    window.dispatchEvent(new CustomEvent('ipesa:search', { detail: q }))
  }

  /* Mark complete */
  const completeReminder = async (id: string) => {
    await fetch(`/api/data/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completado: true }),
    })
    setReminders(prev => prev.filter(r => r.id !== id))
  }

  /* Save general reminder */
  const saveGeneralReminder = async () => {
    if (!remFecha) return
    setRemSaving(true)
    try {
      await fetch('/api/data/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: null,
          lead_name: remNota.trim() || 'Recordatorio',
          nota: remNota.trim(),
          fecha_recordatorio: new Date(remFecha).toISOString(),
        }),
      })
      setRemFecha(''); setRemNota(''); setRemForm(false)
      await loadReminders()
    } finally { setRemSaving(false) }
  }

  const currentTitle = TITLE_MAP[pathname] ?? { t: 'IPESA', s: '' }
  const isActive     = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isContactos  = isActive('/contactos')

  const now        = new Date()
  const badgeCount = reminders.length

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    try { localStorage.removeItem('ipesa_display_name') } catch {}
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="app">
      <div className={`sidebar-scrim ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <img
            src="/ipesa-logo.png"
            alt="IPESA Pinturas"
            style={{ height: 72, objectFit: 'contain', background: '#fff', borderRadius: 12, padding: '8px 16px', display: 'block' }}
          />
        </div>

        <div className="nav-label">Menú</div>
        <nav className="nav">
          {NAV_ITEMS.map(it => {
            const Ic = it.icon
            return (
              <a key={it.id} href={it.href} className={`nav-item ${isActive(it.href) ? 'active' : ''}`} onClick={() => setDrawerOpen(false)}>
                <Ic className="nav-icon" />
                <span>{it.label}</span>
              </a>
            )
          })}
        </nav>

        <div className="user-card">
          <div className="avatar" style={{ background: '#F2B544', color: '#1A1410' }}>{initials(displayName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{displayName}</div>
            <div className="user-role">Sesión activa</div>
          </div>
          <button onClick={handleLogout} title="Cerrar sesión"
            style={{ padding: 6, borderRadius: 6, color: 'rgba(245,239,228,0.5)', display: 'grid', placeItems: 'center' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(245,239,228,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(245,239,228,0.5)' }}
          >
            <Icon.logout style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
            <Icon.menu />
          </button>

          <div className="topbar-brand-mini">
            <img
              src="/ipesa-logo.png"
              alt="IPESA Pinturas"
              style={{ height: 44, objectFit: 'contain', display: 'block' }}
            />
          </div>

          <div className="topbar-title-block">
            <div className="paint-stripe" style={{ marginBottom: 6 }}>
              <div style={{ background: '#EE5A24' }}></div>
              <div style={{ background: '#F2B544' }}></div>
              <div style={{ background: '#3D8B5C' }}></div>
              <div style={{ background: '#1F3A5F' }}></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <div className="topbar-title">{currentTitle.t}</div>
              <div className="topbar-sub">{currentTitle.s}</div>
            </div>
          </div>

          <div className="topbar-actions">
            {/* Search — despacha evento que cada página escucha */}
            <div className="search-input">
              <Icon.search style={{ width: 16, height: 16, color: 'var(--muted)' }} />
              <input
                ref={searchRef}
                placeholder="Buscar…"
                value={search}
                onChange={e => { setSearch(e.target.value); dispatchSearch(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); dispatchSearch('') } }}
              />
              {search && (
                <button onClick={() => { setSearch(''); dispatchSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 4px', fontSize: 14, lineHeight: 1 }}>
                  ×
                </button>
              )}
            </div>

            {/* Bell + panel de recordatorios */}
            <div className="bell-wrap" ref={bellRef}>
              <button className="btn-icon" title="Recordatorios" onClick={() => { setBellOpen(o => !o); setRemForm(false) }}>
                <Icon.bell style={{ width: 16, height: 16, color: badgeCount > 0 ? 'var(--ipesa-orange)' : 'var(--ink-2)' }} />
                {badgeCount > 0 && (
                  <span className="bell-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
                )}
              </button>

              {bellOpen && (
                <div className="notif-panel">
                  <div className="notif-head">
                    <Icon.clock style={{ width: 15, height: 15, color: 'var(--ipesa-orange)' }} />
                    Recordatorios
                    {badgeCount > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                        {badgeCount} pendiente{badgeCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    <button onClick={() => setRemForm(f => !f)}
                      style={{ marginLeft: 'auto', background: remForm ? 'var(--ipesa-orange)' : 'var(--paper)', color: remForm ? '#fff' : 'var(--ipesa-orange)', border: '1px solid var(--ipesa-orange)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      {remForm ? '× Cancelar' : '+ Nuevo'}
                    </button>
                  </div>

                  {/* Formulario recordatorio general */}
                  {remForm && (
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--ipesa-orange-soft)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Nuevo recordatorio</div>
                      <input
                        type="text"
                        value={remNota}
                        onChange={e => setRemNota(e.target.value)}
                        placeholder="Descripción del recordatorio…"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5, outline: 'none', background: '#fff', marginBottom: 7, boxSizing: 'border-box' }}
                      />
                      <input
                        type="datetime-local"
                        value={remFecha}
                        onChange={e => setRemFecha(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5, outline: 'none', background: '#fff', marginBottom: 8, boxSizing: 'border-box' }}
                      />
                      <button
                        onClick={saveGeneralReminder}
                        disabled={!remFecha || remSaving}
                        style={{ width: '100%', padding: '7px', background: 'var(--ipesa-orange)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', opacity: (!remFecha || remSaving) ? 0.5 : 1 }}>
                        {remSaving ? 'Guardando…' : '✓ Crear recordatorio'}
                      </button>
                    </div>
                  )}

                  {/* Lista de recordatorios */}
                  {reminders.length === 0 ? (
                    <div className="notif-empty">
                      <Icon.check style={{ width: 28, height: 28, color: 'var(--ipesa-green)', opacity: 0.5, display: 'block', margin: '0 auto 10px' }} />
                      Sin recordatorios pendientes
                    </div>
                  ) : (
                    reminders.map(r => {
                      const overdue  = new Date(r.fecha_recordatorio) < now
                      const dotColor = overdue ? 'var(--ipesa-orange)' : 'var(--ipesa-yellow)'
                      return (
                        <div className="notif-row" key={r.id}>
                          <span className="notif-dot" style={{ background: dotColor }}></span>
                          <div className="notif-info">
                            <div className="notif-lead">{r.lead_name || r.nota || 'Recordatorio'}</div>
                            {r.nota && r.nota !== r.lead_name && <div className="notif-nota">{r.nota}</div>}
                            <div className="notif-time" style={{ color: overdue ? 'var(--ipesa-orange)' : 'var(--muted-2)' }}>
                              {fmtRem(r.fecha_recordatorio)}
                            </div>
                          </div>
                          <button className="notif-done" onClick={() => completeReminder(r.id)}>
                            ✓ Listo
                          </button>
                        </div>
                      )
                    })
                  )}

                  {/* Toggle push notifications */}
                  {pushSupported && (
                    <div style={{
                      borderTop: '1px solid var(--line)', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <span style={{ fontSize: 14 }}>{pushSubscribed ? '🔔' : '🔕'}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
                        {pushSubscribed ? 'Notificaciones activas' : 'Recibir alertas aunque la app esté cerrada'}
                      </span>
                      <button
                        onClick={pushSubscribed ? disablePush : enablePush}
                        disabled={pushLoading}
                        style={{
                          padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 6,
                          cursor: pushLoading ? 'default' : 'pointer', border: 'none',
                          background: pushSubscribed ? 'var(--ipesa-rose-soft)' : 'var(--ipesa-orange-soft)',
                          color:      pushSubscribed ? 'var(--ipesa-rose)'     : 'var(--ipesa-orange)',
                          opacity: pushLoading ? 0.6 : 1,
                        }}>
                        {pushLoading ? '…' : pushSubscribed ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* CTA: solo en Contactos */}
            {isContactos && (
              <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('ipesa:new-contact'))}>
                <Icon.plus style={{ width: 14, height: 14 }} /> Nuevo Contacto
              </button>
            )}
          </div>
        </div>

        <div className="content">{children}</div>
      </main>

      {/* ── Bottom nav (mobile) — solo los items con mobile: true ── */}
      <nav className="bottom-nav">
        {NAV_ITEMS.filter(it => it.mobile).map(it => {
          const Ic = it.icon
          return (
            <button key={it.id} className={isActive(it.href) ? 'active' : ''} onClick={() => router.push(it.href)}>
              <Ic />
              <span>{it.label === 'Dashboard' ? 'Inicio' : it.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ── FAB ── */}
      <button
        className="fab"
        onClick={() => window.dispatchEvent(new CustomEvent('ipesa:new-contact'))}
        aria-label="Nuevo contacto"
      >
        <Icon.plus />
      </button>
    </div>
  )
}
