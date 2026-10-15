'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BrandLogo } from '@/components/Brand'
import { invalidateSession, useSession } from '@/lib/profile'
import { signOut } from '@/lib/signOut'
import { ROLE_LABELS } from '@/lib/stores'

/**
 * Marco del panel del dueño (/admin): mismo estilo que la app de las tiendas,
 * pero con su propio menú. Abajo, "Tu tienda" abre el CRM de la tienda
 * familiar (o cualquiera donde el dueño sea miembro).
 */

type IconProps = React.SVGProps<SVGSVGElement>
const stroke = (d: React.ReactNode) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}
const Icon = {
  dashboard: stroke(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  store:     stroke(<><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /><path d="M10 20v-4h4v4" /></>),
  external:  stroke(<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />),
  logout:    stroke(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />),
  menu:      stroke(<path d="M3 6h18M3 12h18M3 18h18" />),
}

const NAV = [
  { href: '/admin',         label: 'Resumen', sub: 'Cómo van las tiendas',              icon: Icon.dashboard },
  { href: '/admin/tiendas', label: 'Tiendas', sub: 'Suscripciones, planes y acciones', icon: Icon.store },
]

const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const session  = useSession()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [opening, setOpening]       = useState<string | null>(null)

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))
  const current  = NAV.find(n => isActive(n.href)) ?? NAV[0]
  const name     = session?.user.name || ''
  const stores   = session?.stores ?? []

  // Abrir una tienda: se vuelve la activa y se entra a su Inicio
  const openStore = async (storeId: string) => {
    setOpening(storeId)
    if (storeId !== session?.store?.id) {
      const r = await fetch('/api/stores/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }),
      }).catch(() => null)
      if (!r?.ok) { setOpening(null); return }
      invalidateSession()
    }
    window.location.href = '/'
  }

  return (
    <div className="app">
      <div className="brand-line" aria-hidden="true" />
      <div className={`sidebar-scrim ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />

      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="brand">
          <BrandLogo />
          <span className="admin-tag">Panel del dueño</span>
        </div>

        <nav className="nav" aria-label="Panel del dueño">
          {NAV.map(it => {
            const Ic = it.icon
            return (
              <Link key={it.href} href={it.href} className={`nav-item ${isActive(it.href) ? 'active' : ''}`} aria-current={isActive(it.href) ? 'page' : undefined}>
                <Ic className="nav-icon" />
                <span>{it.label}</span>
              </Link>
            )
          })}
        </nav>

        {stores.length > 0 && (
          <div className="admin-stores">
            <div className="nav-label">{stores.length === 1 ? 'Tu tienda' : 'Tus tiendas'}</div>
            {stores.map(st => (
              <button key={st.id} className="admin-store-btn" onClick={() => openStore(st.id)} disabled={opening !== null}>
                <Icon.store className="nav-icon" />
                <span className="admin-store-text">
                  <strong>{st.name}</strong>
                  <small>{opening === st.id ? 'Abriendo…' : `Entrar como ${ROLE_LABELS[st.role].toLowerCase()}`}</small>
                </span>
                <Icon.external className="admin-store-go" />
              </button>
            ))}
          </div>
        )}

        <div className="user-card">
          <div className="avatar-ring"><div className="avatar">{name ? initials(name) : '·'}</div></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{name || '…'}</div>
            <div className="user-role">Dueño de la plataforma</div>
          </div>
          <button onClick={() => signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className="logout-btn">
            <Icon.logout style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
            <Icon.menu />
          </button>
          <div className="topbar-brand-mini">
            <BrandLogo />
          </div>
          <div className="topbar-title-block">
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <h1 className="topbar-title">{current.label}</h1>
              <div className="topbar-sub">{current.sub}</div>
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  )
}
