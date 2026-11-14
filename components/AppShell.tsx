'use client'

import { apiFetch } from '@/lib/apiClient'


import { useState, useEffect, useRef, useCallback } from 'react'
import Link from '@/components/CachedLink'
import { useQueryEffect } from '@/lib/useCachedQuery'
import QueryBoundary from '@/components/QueryBoundary'
import SessionScope from '@/components/SessionScope'
import { usePathname, useRouter } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import GlobalSearch from '@/components/GlobalSearch'
import { QuickCreateFab, QuickCreateHost, QuickCreateMenu } from '@/components/QuickCreate'
import { APP_NAME } from '@/lib/brand'
import { invalidateSession, useSession } from '@/lib/profile'
import { signOut } from '@/lib/signOut'
import { CURRENT_VERSION, changelogFor } from '@/lib/changelog'
import { SYSTEM_NOTICE } from '@/lib/systemNotice'
import { EMAILS } from '@/lib/legal'
import { ROLE_LABELS, STATUS_LABELS, whatsappPendingTag, type StoreModule } from '@/lib/stores'
import { reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { fmtDue, isDueToday, isOverdue } from '@/lib/datetime'
import { enableDevicePush, pushSupport, testDevicePush } from '@/lib/pushClient'
import { CopyGuard } from '@/components/CopyGuard'
import { WhatsAppIcon } from '@/components/icons'
import {
  House, Users, Activity, CalendarCheck, Settings, Bell, Menu, Plus, CircleHelp, LogOut, Check, ArrowUp,
  Sparkles, X, Wrench, FlaskConical, Store, ChevronsUpDown, Lock, BellOff,
} from 'lucide-react'

/** Estado de los avisos push en este dispositivo. */
function pushStateOf(sub: PushSubscription | null): 'blocked' | 'off' | 'on' {
  if (sub) return 'on'
  return typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'blocked' : 'off'
}

/** Cada cuánto se vuelve a sugerir activar los avisos si alguien cerró la sugerencia. */
const PUSH_PROMPT_SNOOZE_MS = 7 * 86_400_000

/* ── Iconos (Lucide + logo de WhatsApp) ── */
type IconProps = { className?: string; style?: React.CSSProperties; strokeWidth?: number }
const Icon = {
  home: House, contacts: Users, commercial: Activity, calendar: CalendarCheck, settings: Settings,
  bell: Bell, menu: Menu, plus: Plus, help: CircleHelp, logout: LogOut, check: Check, arrowUp: ArrowUp,
  sparkles: Sparkles, close: X, wrench: Wrench, flask: FlaskConical, store: Store, chevrons: ChevronsUpDown,
  lock: Lock, bellOff: BellOff, whatsapp: WhatsAppIcon,
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

/* Menú en el orden del día a día. Mismo nombre en computadora y celular (`short` solo si no cabe abajo en el celular). */
type NavItem = { id: string; href: string; label: string; short?: string; icon: React.ComponentType<IconProps>; mobile: boolean; module?: StoreModule }
const NAV_ITEMS: NavItem[] = [
  { id: 'inicio',    href: '/',              label: 'Inicio',    icon: Icon.home,     mobile: true },
  { id: 'whatsapp',  href: '/whatsapp',      label: 'WhatsApp',  icon: Icon.whatsapp, mobile: true, module: 'whatsapp' },
  { id: 'contactos', href: '/contactos',     label: 'Contactos', icon: Icon.contacts, mobile: true },
  { id: 'comercial', href: '/comercial',     label: 'Sistema Comercial', short: 'Comercial', icon: Icon.commercial, mobile: true },
  { id: 'agenda',    href: '/recordatorios', label: 'Agenda',    icon: Icon.calendar, mobile: true },
]
const TOOL_ITEMS: NavItem[] = [
  { id: 'formulas',  href: '/formulas',      label: 'Fórmulas',  icon: Icon.flask,    mobile: false, module: 'formulas' },
]

const TITLE_MAP: Record<string, { t: string; s: string }> = {
  '/':               { t: 'Inicio',        s: 'Lo que hay que atender hoy'         },
  '/whatsapp':       { t: 'WhatsApp',      s: 'Conversaciones con tus clientes'    },
  '/contactos':      { t: 'Contactos',     s: 'Tu base de clientes'                },
  '/comercial':      { t: 'Sistema Comercial', s: 'Hoy, oportunidades y equipo'     },
  '/recordatorios':  { t: 'Agenda',        s: 'Recordatorios y seguimientos'       },
  '/formulas':       { t: 'Fórmulas',      s: 'Igualación de colores'              },
  '/configuracion':  { t: 'Configuración', s: 'Tu tienda, equipo e integraciones'  },
}

// Páginas tipo "app" que ocupan exactamente el alto de la pantalla
const FILL_ROUTES = ['/whatsapp']
// Botón flotante (celular): qué crea en cada pantalla (en Inicio, a elegir)
const FAB_ROUTES: Record<string, 'contact' | 'reminder' | undefined> = {
  '/': undefined, '/contactos': 'contact', '/comercial': 'contact', '/recordatorios': 'reminder',
}

function AppShellContent({ children }: { children: React.ReactNode }) {
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
  const [pushState,     setPushState]     = useState<'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'>('unsupported')
  const [pushPrompt,    setPushPrompt]    = useState(false)
  const [pushBusy,      setPushBusy]      = useState(false)
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

  // Las novedades no se abren solas: solo con el botón de la versión
  const closeWhatsNew = () => setWhatsNewOpen(false)
  // Novedades: solo lo que aplica a esta tienda (sin lo de módulos que no tiene)
  const notes = changelogFor(session?.store?.modules)

  /* Cerrar el menú lateral y la campana al navegar */
  useEffect(() => { setDrawerOpen(false); setBellOpen(false) }, [pathname])

  /* Botón "volver arriba" — visible tras scrollear hacia abajo */
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Sin tienda todavía, o un administrador no terminó de configurarla → asistente de alta */
  useEffect(() => {
    if (session && (!session.store || (session.isAdmin && !session.store.onboardingCompleted))) router.replace('/bienvenida')
  }, [session, router])

  /* Cambiar de tienda (solo si pertenece a varias) */
  const switchStore = async (storeId: string) => {
    setStoreMenuOpen(false)
    if (storeId === store?.id) return
    const r = await apiFetch('/api/stores/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }),
    })
    if (r.ok) { invalidateSession(); window.location.href = '/' }
  }

  /* WhatsApp: conversaciones sin leer (menú + título de la pestaña) */
  const loadWaUnread = useCallback(() => {
    apiFetch('/api/whatsapp/unread')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.unread === 'number') setWaUnread(d.unread) })
      .catch(() => {})
  }, [])
  useQueryEffect(() => { loadWaUnread() }, [loadWaUnread])
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
    reg.pushManager.getSubscription().then(sub => setPushState(pushStateOf(sub))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (pushSupport() === 'ios-install') setPushState('ios-install')
      return
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      swRegRef.current = reg
      reg.pushManager.getSubscription().then(sub => {
        setPushState(pushStateOf(sub))
        if (!sub) return
        // Re-guardar la suscripción para garantizar que quede ligada al usuario actual
        apiFetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        }).catch(() => {})
      })
    }).catch(err => console.warn('[SW]', err))
    window.addEventListener('crm:push-changed', checkPush)
    return () => window.removeEventListener('crm:push-changed', checkPush)
  }, [checkPush])

  /* Sugerir activar los avisos en este dispositivo (cada uno se activa por separado;
     en iPhone, primero hay que instalar la app) */
  useEffect(() => {
    if (pushState !== 'off' && pushState !== 'ios-install') { setPushPrompt(false); return }
    try {
      const snoozed = Number(window.localStorage.getItem('crm:push-prompt:snoozed') || 0)
      setPushPrompt(Date.now() - snoozed > PUSH_PROMPT_SNOOZE_MS)
    } catch {
      setPushPrompt(true)
    }
  }, [pushState])

  const snoozePushPrompt = () => {
    setPushPrompt(false)
    try { window.localStorage.setItem('crm:push-prompt:snoozed', String(Date.now())) } catch {}
  }

  const enablePushHere = async () => {
    setPushBusy(true)
    try {
      const permission = await enableDevicePush()
      if (permission === 'granted') await testDevicePush()  // la prueba confirma que todo funciona
      else snoozePushPrompt()
    } catch (err) {
      console.warn('[push]', err)
      router.push('/configuracion?tab=avisos')  // ahí se ve el detalle del problema
    } finally {
      setPushBusy(false)
      checkPush()
    }
  }

  /* Recordatorios pendientes + notificación local si alguno vence ahora */
  const loadReminders = useCallback(async () => {
    try {
      const r = await apiFetch('/api/data/reminders')
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
            // Misma etiqueta que el aviso del servidor: si llegan los dos, uno reemplaza al otro
            swRegRef.current.showNotification(due <= t ? 'Recordatorio vencido' : 'Recordatorio próximo', {
              body: reminderTitle(rem),
              icon: '/icon-192.png',
              badge: '/badge-96.png',
              tag: `rem-${rem.id}`,
              requireInteraction: true,
              data: { url: '/recordatorios' },
            })
          }
        }
      }
    } catch {}
  }, [])
  useQueryEffect(() => { loadReminders() }, [loadReminders])
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
    const r = await apiFetch(`/api/data/reminders/${id}`, {
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
  // Menú según los módulos activos de la tienda (mientras carga, todo visible).
  // WhatsApp apagado se le muestra al administrador como "Por activar" para ofrecerlo.
  const waOff        = !!store && !store.modules.whatsapp
  const withModule   = (it: NavItem) => !it.module || !store || store.modules[it.module] || (it.id === 'whatsapp' && !!session?.isAdmin)
  const navItems     = NAV_ITEMS.filter(withModule)
  const toolItems    = TOOL_ITEMS.filter(withModule)
  const readonly     = store?.access === 'readonly'
  // Una sola tienda por cuenta: el menú aparece si hay a dónde cambiar (alguien en varias tiendas)
  const hasStoreMenu = !!session && session.stores.length > 1
  // Stripe no pudo cobrar: los administradores ven el aviso para actualizar la tarjeta
  const paymentIssue = !!session?.isAdmin && !!store?.subscription && (store.subscription.status === 'past_due' || store.subscription.status === 'unpaid')
  const showFab      = !readonly && pathname in FAB_ROUTES
  const helpMailto   = `mailto:${EMAILS.soporte}?subject=${encodeURIComponent(`Ayuda · ${store?.name ?? APP_NAME}`)}&body=${encodeURIComponent(
    `Hola, necesito ayuda con:


---
Tienda: ${store?.name ?? ''}${store ? ` (${store.slug})` : ''}
Plan: ${store?.planLabel ?? ''}
Usuario: ${session?.user.email ?? ''}
Pantalla: ${pathname}`,
  )}`

  // Lo que toca hoy (vencidos + hoy): contador de la campana y de Agenda
  const dueCount = reminders.filter(r => isDueToday(r.fecha_recordatorio, now)).length
  const badgeFor = (id: string): { n: number; cls: string } | null =>
    id === 'whatsapp' && waUnread > 0 ? { n: waUnread, cls: 'wa' }
    : id === 'agenda' && dueCount > 0 ? { n: dueCount, cls: 'due' }
    : null
  const pendingSetup = (id: string) => id === 'whatsapp' && waOff
  // WhatsApp en desarrollo: "Pronto". Cuando se ofrezca: en Cubeta "Por activar"; en Litro y Galón, el nombre del plan
  // Sin el plan que lo incluye, el menú invita a Cubeta
  const waTag = (store ? whatsappPendingTag(store) : 'Pronto') ?? 'Cubeta'

  const navLink = (it: NavItem) => {
    const Ic = it.icon
    const badge = badgeFor(it.id)
    return (
      <Link key={it.id} href={it.href} data-tour={`nav-${it.id}`} className={`nav-item ${isActive(it.href) ? 'active' : ''}`} aria-current={isActive(it.href) ? 'page' : undefined}>
        <Ic className="nav-icon" />
        <span>{it.label}</span>
        {badge && <span className={`nav-count ${badge.cls}`}>{badge.n > 99 ? '99+' : badge.n}</span>}
        {pendingSetup(it.id) && <span className="nav-count off">{waTag}</span>}
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
              {/* Con una sola tienda es solo el nombre; el selector aparece cuando hay a cuál cambiarse */}
              {hasStoreMenu ? (
                <button
                  className="store-switch-btn"
                  onClick={() => setStoreMenuOpen(o => !o)}
                  aria-expanded={storeMenuOpen}
                  aria-haspopup="menu"
                  title="Cambiar de tienda"
                >
                  <Icon.store className="store-switch-icon" />
                  <span className="store-switch-name">{store.name}</span>
                  <Icon.chevrons className="store-switch-chev" />
                </button>
              ) : (
                <div className="store-current">
                  <Icon.store className="store-switch-icon" />
                  <span className="store-switch-name">{store.name}</span>
                </div>
              )}
              {storeMenuOpen && session && (
                <div className="store-menu" role="menu">
                  {session.stores.map(s => (
                    <button key={s.id} role="menuitem" className={`store-menu-item ${s.id === store.id ? 'current' : ''}`} onClick={() => switchStore(s.id)}>
                      <span>{s.name}</span>
                      <small>{ROLE_LABELS[s.role]}</small>
                    </button>
                  ))}
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
          {/* Ayuda: correo a soporte con la tienda y el plan ya escritos para saber quién es */}
          <a className="nav-item" href={helpMailto} title={`Escríbenos a ${EMAILS.soporte}`}>
            <Icon.help className="nav-icon" />
            <span>Ayuda</span>
          </a>
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
                          {!readonly && <button className="notif-done with-icon" onClick={() => completeReminder(r.id)}><Icon.check style={{ width: 12, height: 12 }} strokeWidth={3} /> Listo</button>}
                        </div>
                      )
                    })
                  )}

                  <Link href="/recordatorios" className="notif-foot">
                    {reminders.length > 8 ? `Ver los ${reminders.length} en la Agenda →` : 'Abrir la Agenda →'}
                  </Link>
                  {(pushState === 'off' || pushState === 'blocked') && (
                    <Link href="/configuracion?tab=avisos" className="notif-push-hint">
                      <Icon.bellOff style={{ width: 14, height: 14, flexShrink: 0 }} />
                      {pushState === 'blocked'
                        ? 'Los avisos están bloqueados en este navegador. Ver cómo activarlos'
                        : 'Activa los avisos en este dispositivo para no perderte ninguno'}
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
              Tu tienda está {STATUS_LABELS[store.status].toLowerCase()}: puedes consultar y exportar tu información, pero no registrar cambios.
            </span>
            <Link href="/configuracion?tab=plan" className="plan-banner-cta">Ver plan</Link>
          </div>
        )}
        {paymentIssue && store && (
          <div className="plan-banner readonly" role="status">
            <Icon.lock style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>
              <strong>No pudimos cobrar tu plan {store.planLabel}.</strong>{' '}
              Actualiza tu tarjeta para no perderlo; si el cobro no pasa, tu tienda vuelve al plan Litro.
            </span>
            <Link href="/configuracion?tab=plan" className="plan-banner-cta">Actualizar tarjeta</Link>
          </div>
        )}

        {pushPrompt && (
          <div className="plan-banner push" role="status">
            <Icon.bell style={{ width: 16, height: 16, flexShrink: 0 }} />
            {pushState === 'ios-install' ? (
              <span>
                <strong>Para recibir avisos en este iPhone</strong>, agrega la app a tu pantalla de inicio: toca Compartir
                y luego «Agregar a inicio». Ábrela desde ese ícono y activa los avisos.
              </span>
            ) : (
              <>
                <span>
                  <strong>Activa los avisos en este dispositivo</strong> para que te lleguen tus recordatorios a su hora y los mensajes de tus clientes.
                </span>
                <button className="plan-banner-cta" onClick={enablePushHere} disabled={pushBusy}>{pushBusy ? '…' : 'Activar'}</button>
              </>
            )}
            <button className="plan-banner-close" onClick={snoozePushPrompt} title="Ahora no" aria-label="Ahora no">
              <Icon.close style={{ width: 14, height: 14 }} />
            </button>
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

        <div className="content"><QueryBoundary>{session?.litroBlocked && store ? <LitroNotice storeName={store.name} /> : children}</QueryBoundary></div>
      </main>

      {/* ── Bottom nav (celular) ── */}
      <nav className="bottom-nav" aria-label="Navegación principal">
        {navItems.filter(it => it.mobile).map(it => {
          const Ic = it.icon
          const badge = badgeFor(it.id)
          return (
            <Link key={it.id} href={it.href} data-tour={`nav-${it.id}`} className={isActive(it.href) ? 'active' : ''} aria-current={isActive(it.href) ? 'page' : undefined}>
              <Ic />
              <span>{it.short ?? it.label}</span>
              {badge && <span className={`bn-badge ${badge.cls}`}>{badge.n > 99 ? '99+' : badge.n}</span>}
              {pendingSetup(it.id) && <span className="bn-badge off" title="Por activar"><span className="sr-only">Por activar</span></span>}
            </Link>
          )
        })}
      </nav>

      {/* ── Crear (celular) y formularios de alta compartidos ── */}
      {showFab && <QuickCreateFab kind={FAB_ROUTES[pathname]} />}
      <QuickCreateHost />

      {/* Vendedores: sin seleccionar/copiar/imprimir y con marca de agua (administradores, sin restricción) */}
      <CopyGuard
        active={!!store && !!session && !session.isAdmin}
        label={[displayName || session?.user.email, store?.name].filter(Boolean).join(' · ')}
      />

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
              <h3 className="with-icon" style={{ gap: 8 }}><Icon.sparkles style={{ width: 18, height: 18, color: 'var(--brand)' }} /> Novedades</h3>
              <button className="modal-close btn-icon" onClick={closeWhatsNew} aria-label="Cerrar"><Icon.close style={{ width: 16, height: 16 }} /></button>
            </div>
            <div className="modal-body">
              {notes.map((entry, i) => (
                <div key={entry.version} style={{ marginBottom: i < notes.length - 1 ? 22 : 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>{entry.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>Versión {entry.version} · {entry.date}</div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {entry.items.map((it, j) => (
                      <li key={j} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{it}</li>
                    ))}
                  </ul>
                  {i < notes.length - 1 && <div style={{ borderTop: '1px solid var(--line)', marginTop: 22 }} />}
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  return <SessionScope><AppShellContent>{children}</AppShellContent></SessionScope>
}

/** Plan Litro: solo entra el administrador. Los vendedores ven esto en lugar de la app. */
function LitroNotice({ storeName }: { storeName: string }) {
  return (
    <div className="plan-locked" role="status">
      <h2>Tu tienda está en el plan Litro</h2>
      <p>
        El plan Litro de {storeName} incluye solo al administrador. Tu información sigue guardada: en cuanto el administrador
        cambie a Galón o Cubeta podrás volver a entrar.
      </p>
      <button className="btn btn-ghost" onClick={() => { invalidateSession(); window.location.reload() }}>Volver a revisar</button>
    </div>
  )
}
