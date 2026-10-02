'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getDisplayName, invalidateCurrentUser } from '@/lib/profile'
import { CHANGELOG, CURRENT_VERSION } from '@/lib/changelog'
import { SYSTEM_NOTICE } from '@/lib/systemNotice'

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const output  = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output.buffer as ArrayBuffer
}

// Hora LOCAL en formato YYYY-MM-DDTHH:MM (para min en datetime-local)
function localDatetimeMin(): string {
  const d   = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// La columna reminder_date es timestamp SIN zona horaria → se guarda la hora
// LOCAL tal cual ("2026-05-25T13:02" → "2026-05-25T13:02:00"), sin pasar a UTC.
function datetimeLocalToISO(value: string): string {
  return value + ':00'
}

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
  arrowUp:   (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  sparkles:  (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/><circle cx="12" cy="12" r="2.2"/></svg>,
  close:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  wrench:    (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  whatsapp:  (p: any) => <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  flask:     (p: any) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 2v6.3a2 2 0 0 1-.3 1L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2"/><path d="M7 2h10M6 14h12"/></svg>,
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
  { id: 'dashboard',     href: '/',              label: 'Dashboard',     short: 'Inicio',    icon: Icon.dashboard, mobile: true  },
  { id: 'contactos',     href: '/contactos',     label: 'Contactos',     short: 'Contactos', icon: Icon.contacts,  mobile: true  },
  { id: 'leads',         href: '/leads',         label: 'Leads',         short: 'Leads',     icon: Icon.leads,     mobile: true  },
  { id: 'whatsapp',      href: '/whatsapp',      label: 'WhatsApp',      short: 'WhatsApp',  icon: Icon.whatsapp,  mobile: true  },
  { id: 'recordatorios', href: '/recordatorios', label: 'Recordatorios', short: 'Pendientes', icon: Icon.clock,    mobile: true  },
  { id: 'formulas',      href: '/formulas',      label: 'Fórmulas',      short: 'Fórmulas',  icon: Icon.flask,     mobile: false },
  { id: 'configuracion', href: '/configuracion', label: 'Configuración', short: 'Ajustes',   icon: Icon.settings,  mobile: false },
]

const TITLE_MAP: Record<string, { t: string; s: string }> = {
  '/':               { t: 'Dashboard',         s: 'Resumen de actividad'                },
  '/contactos':      { t: 'Contactos',         s: 'Base de clientes registrados'        },
  '/leads':          { t: 'Pipeline de leads', s: 'Gestión de oportunidades'            },
  '/recordatorios':  { t: 'Recordatorios',     s: 'Seguimiento y tareas pendientes'     },
  '/whatsapp':       { t: 'WhatsApp',          s: 'Conversaciones y campañas'           },
  '/formulas':       { t: 'Fórmulas',          s: 'Igualación de colores'               },
  '/configuracion':  { t: 'Configuración',     s: 'Catálogos, usuarios e integraciones' },
}

// Páginas tipo "app" que ocupan exactamente el alto de la pantalla
const FILL_ROUTES = ['/whatsapp']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [displayName, setDisplayName] = useState('Staff')
  const [bellOpen,    setBellOpen]    = useState(false)
  const [reminders,   setReminders]   = useState<any[]>([])
  const [search,      setSearch]      = useState('')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [whatsNewOpen,  setWhatsNewOpen]  = useState(false)
  const [noticeVisible, setNoticeVisible] = useState(false)
  const [waUnread,      setWaUnread]      = useState(0)

  /* General reminder form inside bell panel */
  const [remForm,   setRemForm]   = useState(false)
  const [remFecha,  setRemFecha]  = useState('')
  const [remNota,   setRemNota]   = useState('')
  const [remSaving, setRemSaving] = useState(false)

  /* Push notifications */
  const [pushSupported,   setPushSupported]   = useState(false)
  const [pushSubscribed,  setPushSubscribed]  = useState(false)
  const [pushWhatsapp,    setPushWhatsapp]    = useState(true)
  const [pushLoading,     setPushLoading]     = useState(false)
  const [pushError,       setPushError]       = useState('')
  const swRegRef     = useRef<ServiceWorkerRegistration | null>(null)
  const notifiedRef  = useRef<Set<string>>(new Set())  // IDs ya notificados esta sesión

  const bellRef = useRef<HTMLDivElement>(null)

  /* Notas de versión — se muestran solas la primera vez que hay una nueva */
  useEffect(() => {
    try {
      const lastSeen = window.localStorage.getItem('ipesa:whatsnew:lastSeen')
      if (lastSeen !== CURRENT_VERSION) setWhatsNewOpen(true)
    } catch {}
  }, [])

  /* Aviso de sistema en mejoras — banner descartable, ver lib/systemNotice.ts */
  useEffect(() => {
    if (!SYSTEM_NOTICE.active) return
    try {
      const dismissed = window.localStorage.getItem('ipesa:notice:dismissed')
      if (dismissed !== SYSTEM_NOTICE.id) setNoticeVisible(true)
    } catch {
      setNoticeVisible(true)
    }
  }, [])

  const dismissNotice = () => {
    setNoticeVisible(false)
    try { window.localStorage.setItem('ipesa:notice:dismissed', SYSTEM_NOTICE.id) } catch {}
  }

  const closeWhatsNew = () => {
    setWhatsNewOpen(false)
    try { window.localStorage.setItem('ipesa:whatsnew:lastSeen', CURRENT_VERSION) } catch {}
  }

  /* Cerrar el menú lateral al navegar */
  useEffect(() => { setDrawerOpen(false); setBellOpen(false) }, [pathname])

  /* Botón "volver arriba" — visible tras scrollear hacia abajo */
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Display name — desde user_metadata (se refresca si alguien edita el perfil) */
  useEffect(() => {
    getDisplayName().then(setDisplayName)
    const refresh = () => { invalidateCurrentUser(); getDisplayName().then(setDisplayName) }
    window.addEventListener('ipesa:profile-updated', refresh)
    return () => window.removeEventListener('ipesa:profile-updated', refresh)
  }, [])

  /* WhatsApp: conversaciones sin leer (menú + título de la pestaña) */
  const loadWaUnread = useCallback(() => {
    fetch('/api/whatsapp/unread')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.unread === 'number') setWaUnread(d.unread) })
      .catch(() => {})
  }, [])
  useVisibleInterval(loadWaUnread, 30_000)
  useEffect(() => {
    window.addEventListener('ipesa:wa-unread-changed', loadWaUnread)
    return () => window.removeEventListener('ipesa:wa-unread-changed', loadWaUnread)
  }, [loadWaUnread])
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '')
    document.title = waUnread > 0 ? `(${waUnread > 99 ? '99+' : waUnread}) ${base}` : base
  }, [waUnread, pathname])

  /* Registrar Service Worker + detectar estado de push */
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    setPushSupported(true)

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(reg => {
      swRegRef.current = reg
      reg.pushManager.getSubscription().then(sub => {
        setPushSubscribed(!!sub)
        if (!sub) return
        // Re-guardar la suscripción para garantizar que quede ligada al usuario actual
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON()),
        }).catch(() => {})
        fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`)
          .then(r => (r.ok ? r.json() : null))
          .then(d => { if (d) setPushWhatsapp(d.notifyWhatsapp !== false) })
          .catch(() => {})
      })
    }).catch(err => console.warn('[SW]', err))
  }, [])

  /* Activar notificaciones push */
  const enablePush = async () => {
    if (!swRegRef.current) return
    setPushLoading(true)
    setPushError('')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushError('Permiso denegado. Actívalo en Ajustes del navegador.')
        return
      }

      const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!VAPID_KEY) throw new Error('VAPID key no configurada')

      const sub = await swRegRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), notifyWhatsapp: pushWhatsapp }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Error ${res.status} al guardar suscripción`)
      }
      setPushSubscribed(true)
    } catch (err: any) {
      console.error('[Push] Error al activar:', err)
      setPushError(err.message || 'Error al activar notificaciones')
    } finally {
      setPushLoading(false)
    }
  }

  /* Desactivar notificaciones push */
  const disablePush = async () => {
    if (!swRegRef.current) return
    setPushLoading(true)
    setPushError('')
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

  /* Avisos de WhatsApp en este dispositivo */
  const toggleWhatsappPush = async () => {
    const next = !pushWhatsapp
    setPushWhatsapp(next)
    const sub = await swRegRef.current?.pushManager.getSubscription()
    if (!sub) return
    const r = await fetch('/api/push/subscribe', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, notifyWhatsapp: next }),
    }).catch(() => null)
    if (!r?.ok) setPushWhatsapp(!next)
  }

  /* Notificación de prueba — usa el servidor (verifica VAPID keys + user_id en DB) */
  const testPush = async () => {
    setPushError('')
    setPushLoading(true)
    try {
      const res  = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setPushError(data.error || `Error ${res.status}`)
      else if (data.sent === 0) setPushError('Se envió pero el navegador no recibió la notificación. Revisa los permisos del sitio.')
    } catch {
      setPushError('No se pudo conectar al servidor de prueba.')
    } finally {
      setPushLoading(false)
    }
  }

  /* Recordatorios pendientes + notificación local si alguno vence ahora */
  const loadReminders = useCallback(async () => {
    try {
      const r = await fetch('/api/data/reminders')
      if (!r.ok) return
      const d = await r.json()
      const pending = (d.reminders || []).filter((rem: any) => !rem.completado)
      setReminders(pending)

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && swRegRef.current) {
        const now = Date.now()
        for (const rem of pending) {
          const due = new Date(rem.fecha_recordatorio).getTime()
          // Vence en los próximos 65 s o venció hace menos de 65 s, y no notificado aún
          if (Math.abs(due - now) <= 65_000 && !notifiedRef.current.has(rem.id)) {
            notifiedRef.current.add(rem.id)
            swRegRef.current.showNotification(due <= now ? '⏰ Recordatorio vencido' : '🔔 Recordatorio próximo', {
              body: rem.nota || rem.lead_name || 'Recordatorio pendiente',
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

  /* Cerrar campana con clic fuera */
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

  /* Búsqueda global → cada página escucha ipesa:search */
  const dispatchSearch = (q: string) => {
    window.dispatchEvent(new CustomEvent('ipesa:search', { detail: q }))
  }
  useEffect(() => { setSearch('') }, [pathname])

  const completeReminder = async (id: string) => {
    const r = await fetch(`/api/data/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completado: true }),
    })
    if (r.ok) setReminders(prev => prev.filter(x => x.id !== id))
  }

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
          fecha_recordatorio: datetimeLocalToISO(remFecha),
        }),
      })
      setRemFecha(''); setRemNota(''); setRemForm(false)
      await loadReminders()
    } finally { setRemSaving(false) }
  }

  const currentTitle = TITLE_MAP[pathname] ?? { t: 'IPESA', s: '' }
  const isActive     = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const isContactos  = isActive('/contactos')
  const fill         = FILL_ROUTES.some(r => pathname.startsWith(r))

  const now        = new Date()
  const badgeCount = reminders.length

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className="app">
      <div className="brand-line" aria-hidden="true" />
      <div className={`sidebar-scrim ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src="/ipesa-logo.png" alt="IPESA Pinturas" width={480} height={209} className="brand-logo" />
        </div>

        <div className="nav-label">Menú</div>
        <nav className="nav">
          {NAV_ITEMS.map(it => {
            const Ic = it.icon
            return (
              <Link key={it.id} href={it.href} className={`nav-item ${isActive(it.href) ? 'active' : ''}`}>
                <Ic className="nav-icon" />
                <span>{it.label}</span>
                {it.id === 'whatsapp' && waUnread > 0 && <span className="nav-count wa">{waUnread > 99 ? '99+' : waUnread}</span>}
              </Link>
            )
          })}
        </nav>

        <div className="user-card">
          <div className="avatar-ring"><div className="avatar">{initials(displayName)}</div></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{displayName}</div>
            <div className="user-role">Sesión activa</div>
          </div>
          <button onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión" className="logout-btn">
            <Icon.logout style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <button className="version-btn" onClick={() => setWhatsNewOpen(true)} title="Ver novedades de esta versión">
          v{CURRENT_VERSION}
        </button>
      </aside>

      {/* ── Main ── */}
      <main className={`main ${fill ? 'main--fill' : ''}`}>
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
            <Icon.menu />
          </button>

          <div className="topbar-brand-mini">
            <img src="/ipesa-logo.png" alt="IPESA Pinturas" width={480} height={209} style={{ height: 44, width: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>

          <div className="topbar-title-block">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <div className="topbar-title">{currentTitle.t}</div>
              <div className="topbar-sub">{currentTitle.s}</div>
            </div>
          </div>

          <div className="topbar-actions">
            {/* La búsqueda global solo aplica a páginas con lista (Contactos/Leads) */}
            {!fill && (
              <div className="search-input">
                <Icon.search style={{ width: 16, height: 16, color: 'var(--muted)' }} />
                <input
                  placeholder="Buscar…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); dispatchSearch(e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); dispatchSearch('') } }}
                />
                {search && (
                  <button onClick={() => { setSearch(''); dispatchSearch('') }} aria-label="Limpiar búsqueda"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 4px', fontSize: 14, lineHeight: 1 }}>
                    ×
                  </button>
                )}
              </div>
            )}

            <button className="btn-icon" title="Novedades" aria-label="Novedades" onClick={() => setWhatsNewOpen(true)}>
              <Icon.sparkles style={{ width: 16, height: 16, color: 'var(--ink-2)' }} />
            </button>

            {/* Bell + panel de recordatorios */}
            <div className="bell-wrap" ref={bellRef}>
              <button className="btn-icon" title="Recordatorios" aria-label="Recordatorios" onClick={() => { setBellOpen(o => !o); setRemForm(false) }}>
                <Icon.bell style={{ width: 16, height: 16, color: badgeCount > 0 ? 'var(--ipesa-orange)' : 'var(--ink-2)' }} />
                {badgeCount > 0 && <span className="bell-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>}
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

                  {remForm && (
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--ipesa-orange-soft)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Nuevo recordatorio</div>
                      <input
                        type="text"
                        value={remNota}
                        onChange={e => setRemNota(e.target.value)}
                        placeholder="Descripción del recordatorio…"
                        maxLength={1000}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 7, fontSize: 12.5, outline: 'none', background: '#fff', marginBottom: 7, boxSizing: 'border-box' }}
                      />
                      <input
                        type="datetime-local"
                        value={remFecha}
                        onChange={e => setRemFecha(e.target.value)}
                        min={localDatetimeMin()}
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
                          <button className="notif-done" onClick={() => completeReminder(r.id)}>✓ Listo</button>
                        </div>
                      )
                    })
                  )}

                  {pushSupported && (
                    <div style={{ borderTop: '1px solid var(--line)', padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{pushSubscribed ? '🔔' : '🔕'}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, lineHeight: 1.3 }}>
                          {pushSubscribed ? 'Notificaciones activas' : 'Alertas cuando la app esté cerrada'}
                        </span>
                        {pushSubscribed && (
                          <button onClick={testPush} title="Enviar notificación de prueba"
                            style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--line)', background: 'none', color: 'var(--muted)' }}>
                            Test
                          </button>
                        )}
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
                      {pushSubscribed && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={pushWhatsapp} onChange={toggleWhatsappPush} style={{ accentColor: '#25D366' }} />
                          Avisarme cuando llegue un WhatsApp
                        </label>
                      )}
                      {pushError && (
                        <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--ipesa-rose-soft)', color: 'var(--ipesa-rose)', fontSize: 11.5, fontWeight: 600, lineHeight: 1.4 }}>
                          ⚠️ {pushError}
                        </div>
                      )}
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

      {/* ── Bottom nav (mobile) ── */}
      <nav className="bottom-nav" aria-label="Navegación principal">
        {NAV_ITEMS.filter(it => it.mobile).map(it => {
          const Ic = it.icon
          return (
            <Link key={it.id} href={it.href} className={isActive(it.href) ? 'active' : ''} aria-current={isActive(it.href) ? 'page' : undefined}>
              <Ic />
              <span>{it.short}</span>
              {it.id === 'whatsapp' && waUnread > 0 && <span className="bn-badge">{waUnread > 99 ? '99+' : waUnread}</span>}
            </Link>
          )
        })}
      </nav>

      {/* ── FAB — solo en Contactos ── */}
      {isContactos && (
        <button className="fab" onClick={() => window.dispatchEvent(new CustomEvent('ipesa:new-contact'))} aria-label="Nuevo contacto">
          <Icon.plus />
        </button>
      )}

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
