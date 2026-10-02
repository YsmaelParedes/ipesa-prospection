'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import GlobalSearch from '@/components/GlobalSearch'
import { QuickCreateFab, QuickCreateHost, QuickCreateMenu } from '@/components/QuickCreate'
import { APP_NAME } from '@/lib/brand'
import { invalidateSession, useSession } from '@/lib/profile'
import { signOut } from '@/lib/signOut'
import { CHANGELOG, CURRENT_VERSION } from '@/lib/changelog'
import { SYSTEM_NOTICE } from '@/lib/systemNotice'
import { ROLE_LABELS, STATUS_LABELS, type StoreModule } from '@/lib/stores'
import { reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { fmtDue, isDueToday, isOverdue } from '@/lib/datetime'

/** Ejecuta `fn` cada `ms` solo con la pestaña visible (y al volver a ella). */
function useVisibleInterval(fn: () => void, ms: number) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    ref.current()
    const t = setInterval(() => { if (document.visibilityState === 'visible') ref.current() }, ms)
    const onVis = () => { if (document.visibilityState === 'visible') ref.current() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [ms])
}

/* ── Iconos ── */
type IconProps = React.SVGProps<SVGSVGElement>
const stroke = (d: React.ReactNode, w = 2) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}
const Icon = {
  home:      stroke(<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" /></>),
  contacts:  stroke(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  leads:     stroke(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  calendar:  stroke(<><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 15.5 2 2 4-4" /></>),
  settings:  stroke(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  bell:      stroke(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  menu:      stroke(<path d="M3 6h18M3 12h18M3 18h18" />, 2.2),
  plus:      stroke(<path d="M12 5v14M5 12h14" />, 2.4),
  logout:    stroke(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />),
  check:     stroke(<path d="m5 13 4 4L19 7" />, 2.4),
  arrowUp:   stroke(<path d="M12 19V5M5 12l7-7 7 7" />, 2.4),
  sparkles:  stroke(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" /><circle cx="12" cy="12" r="2.2" /></>),
  close:     stroke(<path d="M18 6 6 18M6 6l12 12" />),
  wrench:    stroke(<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />),
  flask:     stroke(<><path d="M9 2v6.3a2 2 0 0 1-.3 1L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2" /><path d="M7 2h10M6 14h12" /></>),
  store:     stroke(<><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /><path d="M10 20v-4h4v4" /></>),
  chevrons:  stroke(<path d="m7 15 5 5 5-5M7 9l5-5 5 5" />),
  shield:    stroke(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />),
  lock:      stroke(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  bellOff:   stroke(<><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M2 2l20 20" /></>),
  whatsapp:  (p: IconProps) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" /></svg>,
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/* Menú en el orden del día a día. Mismo nombre en computadora y celular. */
type NavItem = { id: string; href: string; label: string; icon: (p: IconProps) => React.ReactElement; mobile: boolean; module?: StoreModule }
const NAV_ITEMS: NavItem[] = [
  { id: 'inicio',    href: '/',              label: 'Inicio',    icon: Icon.home,     mobile: true },
  { id: 'whatsapp',  href: '/whatsapp',      label: 'WhatsApp',  icon: Icon.whatsapp, mobile: true, module: 'whatsapp' },
  { id: 'contactos', href: '/contactos',     label: 'Contactos', icon: Icon.contacts, mobile: true },
  { id: 'leads',     href: '/leads',         label: 'Leads',     icon: Icon.leads,    mobile: true },
  { id: 'agenda',    href: '/recordatorios', label: 'Agenda',    icon: Icon.calendar, mobile: true },
]
const TOOL_ITEMS: NavItem[] = [
  { id: 'formulas',  href: '/formulas',      label: 'Fórmulas',  icon: Icon.flask,    mobile: false, module: 'formulas' },
]

const TITLE_MAP: Record<string, { t: string; s: string }> = {
  '/':               { t: 'Inicio',        s: 'Lo que hay que atender hoy'         },
  '/whatsapp':       { t: 'WhatsApp',      s: 'Conversaciones y campañas'          },
  '/contactos':      { t: 'Contactos',     s: 'Tu base de clientes'                },
  '/leads':          { t: 'Leads',         s: 'Oportunidades de venta'             },
  '/recordatorios':  { t: 'Agenda',        s: 'Recordatorios y seguimientos'       },
  '/formulas':       { t: 'Fórmulas',      s: 'Igualación de colores'              },
  '/configuracion':  { t: 'Configuración', s: 'Tu tienda, equipo e integraciones'  },
  '/plataforma':     { t: 'Plataforma',    s: 'Tiendas, pruebas y suscripciones'   },
}

// Páginas tipo "app" que ocupan exactamente el alto de la pantalla
const FILL_ROUTES = ['/whatsapp']
// Botón flotante (celular): qué crea en cada pantalla (en Inicio, a elegir)
const FAB_ROUTES: Record<string, 'contact' | 'lead' | 'reminder' | undefined> = {
  '/': undefined, '/contactos': 'contact', '/leads': 'lead', '/recordatorios': 'reminder',
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const session  = useSession()
  const store    = session?.store ?? null
  const displayName = session?.user.name || ''

  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [storeMenuOpen, setStoreMenuOpen] = useState(false)
  const [bellOpen,      setBellOpen]      = useState(false)
  const [reminders,     setReminders]     = useState<Reminder[]>([])
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [whatsNewOpen,  setWhatsNewOpen]  = useState(false)
  const [noticeVisible, setNoticeVisible] = useState(false)
  const [waUnread,      setWaUnread]      = useState(0)
  const [pushState,     setPushState]     = useState<'unsupported' | 'off' | 'on'>('unsupported')
  const [now,           setNow]           = useState(() => new Date())

  const swRegRef    = useRef<ServiceWorkerRegistration | null>(null)
  const notifiedRef = useRef<Set<string>>(new Set())  // IDs ya notificados esta sesión
  const bellRef      = useRef<HTMLDivElement>(null)
  const storeMenuRef = useRef<HTMLDivElement>(null)

  /* Cerrar el menú de tiendas al hacer clic fuera o con Escape */
  useEffect(() => {
    if (!storeMenuOpen) return
    const onDown = (e: MouseEvent) => { if (!storeMenuRef.current?.contains(e.target as Node)) setStoreMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setStoreMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [storeMenuOpen])

  /* Notas de versión — se muestran solas la primera vez que hay una nueva */
  useEffect(() => {
    try {
      const lastSeen = window.localStorage.getItem('crm:whatsnew:lastSeen')
      if (lastSeen !== CURRENT_VERSION) setWhatsNewOpen(true)
    } catch {}
  }, [])

  /* Aviso de sistema en mejoras — banner descartable, ver lib/systemNotice.ts */
  useEffect(() => {
    if (!SYSTEM_NOTICE.active) return
    try {
      const dismissed = window.localStorage.getItem('crm:notice:dismissed')
      if (dismissed !== SYSTEM_NOTICE.id) setNoticeVisible(true)
    } catch {
      setNoticeVisible(true)
    }
  }, [])

  const dismissNotice = () => {
    setNoticeVisible(false)
    try { window.localStorage.setItem('crm:notice:dismissed', SYSTEM_NOTICE.id) } catch {}
  }

  const closeWhatsNew = () => {
    setWhatsNewOpen(false)
    try { window.localStorage.setItem('crm:whatsnew:lastSeen', CURRENT_VERSION) } catch {}
  }

  /* Cerrar el menú lateral y la campana al navegar */
  useEffect(() => { setDrawerOpen(false); setBellOpen(false) }, [pathname])

  /* Botón "volver arriba" — visible tras scrollear hacia abajo */
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Sin tienda todavía, o el dueño no terminó de configurarla → asistente de alta */
  useEffect(() => {
    if (session && (!session.store || (session.isOwner && !session.store.onboardingCompleted))) router.replace('/bienvenida')
  }, [session, router])

  /* Cambiar de tienda (solo si pertenece a varias) */
  const switchStore = async (storeId: string) => {
    setStoreMenuOpen(false)
    if (storeId === store?.id) return
    const r = await fetch('/api/stores/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }),
    })
    if (r.ok) { invalidateSession(); window.location.href = '/' }
  }

  /* WhatsApp: conversaciones sin leer (menú + título de la pestaña) */
  const loadWaUnread = useCallback(() => {
    fetch('/api/whatsapp/unread')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.unread === 'number') setWaUnread(d.unread) })
      .catch(() => {})
  }, [])
  useVisibleInterval(loadWaUnread, 30_000)
  useEffect(() => {
    window.addEventListener('crm:wa-unread-changed', loadWaUnread)
    return () => window.removeEventListener('crm:wa-unread-changed', loadWaUnread)
  }, [loadWaUnread])
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = waUnread > 0 ? `(${waUnread > 99 ? '99+' : waUnread}) ${base}` : base
  }, [waUnread, pathname])

  /* Service Worker (avisos push) — los ajustes viven en Configuración → Mi cuenta */
  const checkPush = useCallback(() => {
    const reg = swRegRef.current
    if (!reg) return
    reg.pushManager.getSubscription().then(sub => setPushState(sub ? 'on' : 'off')).catch(() => {})
  }, [])
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      swRegRef.current = reg
      reg.pushManager.getSubscription().then(sub => {
        setPushState(sub ? 'on' : 'off')
        if (!sub) return
        // Re-guardar la suscripción para garantizar que quede ligada al usuario actual
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        }).catch(() => {})
      })
    }).catch(err => console.warn('[SW]', err))
    window.addEventListener('crm:push-changed', checkPush)
    return () => window.removeEventListener('crm:push-changed', checkPush)
  }, [checkPush])

  /* Recordatorios pendientes + notificación local si alguno vence ahora */
  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch('/api/data/reminders')
      if (!r.ok) return
      const d = await r.json()
      const pending: Reminder[] = (d.reminders || []).filter((rem: Reminder) => !rem.completado)
      setReminders(pending)
      setNow(new Date())

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && swRegRef.current) {
        const t = Date.now()
        for (const rem of pending) {
          const due = new Date(rem.fecha_recordatorio).getTime()
          // Vence en los próximos 65 s o venció hace menos de 65 s, y no notificado aún
          if (Math.abs(due - t) <= 65_000 && !notifiedRef.current.has(rem.id)) {
            notifiedRef.current.add(rem.id)
            swRegRef.current.showNotification(due <= t ? '⏰ Recordatorio vencido' : '🔔 Recordatorio próximo', {
              body: reminderTitle(rem),
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: `rem-${rem.id}`,
              requireInteraction: true,
              data: { url: '/recordatorios' },
            })
          }
        }
      }
    } catch {}
  }, [])
  useVisibleInterval(loadReminders, 60_000)
  useDataChanged(['reminder'], loadReminders)

  /* Cerrar campana con clic fuera o Escape */
  useEffect(() => {
    if (!bellOpen) return
    const onDown = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBellOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [bellOpen])

  const completeReminder = async (id: string) => {
    const r = await fetch(`/api/data/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completado: true }),
    })
    if (r.ok) {
      setReminders(prev => prev.filter(x => x.id !== id))
      notifyDataChanged('reminder')
    }
  }

  const currentTitle = TITLE_MAP[pathname] ?? { t: APP_NAME, s: '' }
  const isActive     = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const fill         = FILL_ROUTES.some(r => pathname.startsWith(r))
  // Menú según los módulos activos de la tienda (mientras carga, todo visible)
  const withModule   = (it: NavItem) => !it.module || !store || store.modules[it.module]
  const navItems     = NAV_ITEMS.filter(withModule)
  const toolItems    = TOOL_ITEMS.filter(withModule)
  const readonly     = store?.access === 'readonly'
  // El dueño puede abrir otra sucursal; el menú aparece si hay a dónde cambiar o algo que agregar
  const canAddStore  = !!session?.isOwner
  const hasStoreMenu = !!session && (session.stores.length > 1 || canAddStore)
  const trialLeft    = store?.status === 'trial' && !readonly ? store.trialDaysLeft : null
  const showFab      = !readonly && pathname in FAB_ROUTES

  // Lo que toca hoy (vencidos + hoy): contador de la campana y de Agenda
  const dueCount = reminders.filter(r => isDueToday(r.fecha_recordatorio, now)).length
  const badgeFor = (id: string) =>
    id === 'whatsapp' && waUnread > 0 ? { n: waUnread, cls: 'wa' }
    : id === 'agenda' && dueCount > 0 ? { n: dueCount, cls: 'due' }
    : null

  const navLink = (it: NavItem) => {
    const Ic = it.icon
    const badge = badgeFor(it.id)
    return (
      <Link key={it.id} href={it.href} className={`nav-item ${isActive(it.href) ? 'active' : ''}`} aria-current={isActive(it.href) ? 'page' : undefined}>
        <Ic className="nav-icon" />
        <span>{it.label}</span>
        {badge && <span className={`nav-count ${badge.cls}`}>{badge.n > 99 ? '99+' : badge.n}</span>}
      </Link>
    )
  }

  return (
    <div className="app">
      <div className="brand-line" aria-hidden="true" />
      <div className={`sidebar-scrim ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          {store?.logoUrl
            ? <img src={store.logoUrl} alt={store.name} width={480} height={209} className="brand-logo" />
            : <BrandLogo />}
          {store && (
            <div className="store-switch" ref={storeMenuRef}>
              <button
                className="store-switch-btn"
                onClick={() => hasStoreMenu && setStoreMenuOpen(o => !o)}
                aria-expanded={hasStoreMenu ? storeMenuOpen : undefined}
                aria-haspopup={hasStoreMenu ? 'menu' : undefined}
                title={hasStoreMenu ? 'Cambiar o agregar sucursal' : store.name}
              >
                <Icon.store className="store-switch-icon" />
                <span className="store-switch-name">{store.name}</span>
                {hasStoreMenu && <Icon.chevrons className="store-switch-chev" />}
              </button>
              {storeMenuOpen && session && (
                <div className="store-menu" role="menu">
                  {session.stores.map(s => (
                    <button key={s.id} role="menuitem" className={`store-menu-item ${s.id === store.id ? 'current' : ''}`} onClick={() => switchStore(s.id)}>
                      <span>{s.name}</span>
                      <small>{ROLE_LABELS[s.role]}</small>
                    </button>
                  ))}
                  {canAddStore && (
                    <Link href="/bienvenida?nueva=1" role="menuitem" className="store-menu-item store-menu-add" onClick={() => setStoreMenuOpen(false)}>
                      <span><Icon.plus />Agregar sucursal</span>
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="nav" aria-label="Menú principal">
          {navItems.map(navLink)}
        </nav>

        {toolItems.length > 0 && (
          <>
            <div className="nav-label">Herramientas</div>
            <nav className="nav" aria-label="Herramientas">{toolItems.map(navLink)}</nav>
          </>
        )}

        <nav className="nav nav-bottom" aria-label="Ajustes">
          <Link href="/configuracion" className={`nav-item ${isActive('/configuracion') ? 'active' : ''}`} aria-current={isActive('/configuracion') ? 'page' : undefined}>
            <Icon.settings className="nav-icon" />
            <span>Configuración</span>
          </Link>
          {session?.platformAdmin && (
            <Link href="/plataforma" className={`nav-item nav-item-platform ${isActive('/plataforma') ? 'active' : ''}`}>
              <Icon.shield className="nav-icon" />
              <span>Plataforma</span>
            </Link>
          )}
        </nav>

        <div className="user-card">
          <div className="avatar-ring"><div className="avatar">{displayName ? initials(displayName) : '·'}</div></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{displayName || '…'}</div>
            <div className="user-role">{session?.role ? ROLE_LABELS[session.role] : ''}</div>
          </div>
          <button onClick={() => signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className="logout-btn">
            <Icon.logout style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <button className="version-btn" onClick={() => setWhatsNewOpen(true)} title="Ver novedades de esta versión">
          <Icon.sparkles style={{ width: 12, height: 12 }} /> Novedades · v{CURRENT_VERSION}
        </button>
      </aside>

      {/* ── Main ── */}
      <main className={`main ${fill ? 'main--fill' : ''}`}>
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
            <Icon.menu />
          </button>

          <div className="topbar-brand-mini">
            <BrandLogo />
          </div>

          <div className="topbar-title-block">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <h1 className="topbar-title">{currentTitle.t}</h1>
              <div className="topbar-sub">{currentTitle.s}</div>
            </div>
          </div>

          <div className="topbar-actions">
            <GlobalSearch />
            {!readonly && <QuickCreateMenu />}

            {/* Campana: recordatorios pendientes */}
            <div className="bell-wrap" ref={bellRef}>
              <button className="btn-icon" title="Recordatorios" aria-label={`Recordatorios${dueCount ? `: ${dueCount} para hoy` : ''}`} aria-expanded={bellOpen}
                onClick={() => { setBellOpen(o => !o); setNow(new Date()) }}>
                <Icon.bell style={{ width: 16, height: 16, color: dueCount > 0 ? 'var(--brand)' : 'var(--ink-2)' }} />
                {dueCount > 0 && <span className="bell-badge">{dueCount > 9 ? '9+' : dueCount}</span>}
              </button>

              {bellOpen && (
                <div className="notif-panel">
                  <div className="notif-head">
                    Recordatorios
                    <span className="notif-head-sub">{reminders.length ? `${reminders.length} pendiente${reminders.length !== 1 ? 's' : ''}` : ''}</span>
                    {!readonly && (
                      <button className="notif-new" onClick={() => { setBellOpen(false); openQuickCreate({ kind: 'reminder' }) }}>
                        <Icon.plus style={{ width: 12, height: 12 }} /> Nuevo
                      </button>
                    )}
                  </div>

                  {reminders.length === 0 ? (
                    <div className="notif-empty">
                      <Icon.check style={{ width: 28, height: 28, color: 'var(--success)', opacity: 0.5, display: 'block', margin: '0 auto 10px' }} />
                      Sin recordatorios pendientes
                    </div>
                  ) : (
                    reminders.slice(0, 8).map(r => {
                      const overdue = isOverdue(r.fecha_recordatorio, now)
                      const subject = reminderSubject(r)
                      return (
                        <div className="notif-row" key={r.id}>
                          <span className="notif-dot" style={{ background: overdue ? 'var(--brand)' : isDueToday(r.fecha_recordatorio, now) ? 'var(--warning-fill)' : 'var(--c-cyan)' }}></span>
                          <div className="notif-info">
                            <div className="notif-lead">{reminderTitle(r)}</div>
                            {subject && <div className="notif-nota">{subject}</div>}
                            <div className="notif-time" style={{ color: overdue ? 'var(--brand)' : undefined }}>{fmtDue(r.fecha_recordatorio, now)}</div>
                          </div>
                          {!readonly && <button className="notif-done" onClick={() => completeReminder(r.id)}>✓ Listo</button>}
                        </div>
                      )
                    })
                  )}

                  <Link href="/recordatorios" className="notif-foot">
                    {reminders.length > 8 ? `Ver los ${reminders.length} en la Agenda →` : 'Abrir la Agenda →'}
                  </Link>
                  {pushState === 'off' && (
                    <Link href="/configuracion?tab=cuenta" className="notif-push-hint">
                      <Icon.bellOff style={{ width: 14, height: 14, flexShrink: 0 }} />
                      Activa los avisos en este dispositivo para no perderte ninguno
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {readonly && store && (
          <div className="plan-banner readonly" role="status">
            <Icon.lock style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>
              <strong>Modo solo lectura.</strong>{' '}
              {store.status === 'trial' ? 'Terminó tu prueba gratis' : store.status === 'active' ? 'Venció el pago de tu suscripción' : `Tu tienda está ${STATUS_LABELS[store.status].toLowerCase()}`}:
              puedes consultar y exportar tu información, pero no registrar cambios.
            </span>
            <Link href="/configuracion?tab=plan" className="plan-banner-cta">Activar</Link>
          </div>
        )}
        {trialLeft !== null && (
          <div className="plan-banner trial" role="status">
            <Icon.sparkles style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>
              Prueba gratis: {trialLeft === 0 ? 'termina hoy' : `te ${trialLeft === 1 ? 'queda 1 día' : `quedan ${trialLeft} días`}`}.
            </span>
            <Link href="/configuracion?tab=plan" className="plan-banner-cta">Ver plan</Link>
          </div>
        )}

        {noticeVisible && (
          <div className="system-notice">
            <Icon.wrench style={{ width: 15, height: 15, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{SYSTEM_NOTICE.message}</span>
            <button onClick={dismissNotice} title="Cerrar" aria-label="Cerrar aviso">
              <Icon.close style={{ width: 15, height: 15 }} />
            </button>
          </div>
        )}

        <div className="content">{children}</div>
      </main>

      {/* ── Bottom nav (celular) ── */}
      <nav className="bottom-nav" aria-label="Navegación principal">
        {navItems.filter(it => it.mobile).map(it => {
          const Ic = it.icon
          const badge = badgeFor(it.id)
          return (
            <Link key={it.id} href={it.href} className={isActive(it.href) ? 'active' : ''} aria-current={isActive(it.href) ? 'page' : undefined}>
              <Ic />
              <span>{it.label}</span>
              {badge && <span className={`bn-badge ${badge.cls}`}>{badge.n > 99 ? '99+' : badge.n}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── Crear (celular) y formularios de alta compartidos ── */}
      {showFab && <QuickCreateFab kind={FAB_ROUTES[pathname]} />}
      <QuickCreateHost />

      {/* ── Volver arriba ── */}
      {!fill && (
        <button
          className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Volver arriba"
          title="Volver arriba"
          tabIndex={showScrollTop ? 0 : -1}
        >
          <Icon.arrowUp />
        </button>
      )}

      {/* ── Novedades — notas de versión ── */}
      {whatsNewOpen && (
        <div className="modal" onClick={closeWhatsNew}>
          <div className="modal-card" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🎉 Novedades</h3>
              <button className="modal-close btn-icon" onClick={closeWhatsNew} aria-label="Cerrar"><Icon.close style={{ width: 16, height: 16 }} /></button>
            </div>
            <div className="modal-body">
              {CHANGELOG.map((entry, i) => (
                <div key={entry.version} style={{ marginBottom: i < CHANGELOG.length - 1 ? 22 : 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{entry.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>{entry.date}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entry.items.map((it, j) => (
                      <li key={j} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{it}</li>
                    ))}
                  </ul>
                  {i < CHANGELOG.length - 1 && <div style={{ borderTop: '1px solid var(--line)', marginTop: 22 }} />}
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={closeWhatsNew}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
