'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import Link from '@/components/CachedLink'
import { WhatsAppIcon } from '@/components/icons'
import { groupOf, menuFor, pageHref, type MenuAccess, type MenuEntry, type MenuIcon, type MenuPage, type MenuPageId } from '@/lib/menu'
import { Activity, Briefcase, CalendarCheck, ChartColumn, ChevronDown, House, Lock, Settings, Users, Wrench } from 'lucide-react'

type IconProps = { className?: string }

export const MENU_ICONS: Record<MenuIcon, React.ComponentType<IconProps>> = {
  home: House, whatsapp: WhatsAppIcon, contacts: Users, commercial: Activity, sales: Briefcase,
  chart: ChartColumn, calendar: CalendarCheck, tools: Wrench, settings: Settings,
}

export type MenuBadge = { n: number; cls: string }

const OPEN_KEY = 'crm:menu:open'
const readOpen = (): string[] => {
  try {
    const v = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

/** Lo que ven todos, mientras no se sepa quién es. */
export const BASE_MENU = menuFor({ isAdmin: false, modules: { whatsapp: true, campaigns: false, formulas: false }, reports: true })

const ACCESS_KEY = 'crm:menu:access'
/** Guarda en este equipo qué ve la persona, para que la app en gris tenga la misma forma al volver a entrar. */
export function rememberMenu(access: MenuAccess) {
  try { window.localStorage.setItem(ACCESS_KEY, JSON.stringify(access)) } catch {}
}
/** El menú de la última vez en este equipo (o el de todos); `known`: ya se sabe de quién es. */
export function useRememberedMenu(): { entries: MenuEntry[]; known: boolean } {
  const [menu, setMenu] = useState({ entries: BASE_MENU, known: false })
  useLayoutEffect(() => {
    try {
      const a = JSON.parse(window.localStorage.getItem(ACCESS_KEY) ?? 'null') as MenuAccess | null
      if (a && typeof a.isAdmin === 'boolean') setMenu({ entries: menuFor({ isAdmin: a.isAdmin, modules: a.modules ?? null, reports: !!a.reports }), known: true })
    } catch {}
  }, [])
  return menu
}

/**
 * Menú lateral con grupos que se despliegan. El clic en un grupo solo lo abre
 * o lo cierra; el de la pantalla actual se abre solo y los demás se quedan como
 * se dejaron en este equipo. Con el grupo cerrado, su número sale en el grupo.
 */
export function SideMenu({ entries, active, at, badgeOf, pending, onNavigate }: {
  entries: MenuEntry[]
  active: MenuPage | null
  at: { pathname: string; search: URLSearchParams }
  badgeOf: (id: MenuPageId) => MenuBadge | null
  /** WhatsApp sin activar: «Por activar» o null (candado, viene en Cubeta). undefined: no aplica. */
  pending?: (id: MenuPageId) => string | null | undefined
  onNavigate?: () => void
}) {
  const current = groupOf(entries, active)
  // null: aún no se lee lo guardado en este equipo (en el servidor no existe)
  const [saved, setSaved] = useState<string[] | null>(null)
  const open = saved ?? (current ? [current] : [])
  useLayoutEffect(() => {
    setSaved(o => {
      const base = o ?? readOpen()
      return current && !base.includes(current) ? [...base, current] : base
    })
  }, [current])
  useEffect(() => {
    if (!saved) return
    try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(saved)) } catch {}
  }, [saved])
  const toggle = (id: string) => setSaved(open.includes(id) ? open.filter(x => x !== id) : [...open, id])

  const link = (p: MenuPage, icon?: MenuIcon) => {
    const Ic = icon ? MENU_ICONS[icon] : null
    const badge = badgeOf(p.id)
    const tag = pending?.(p.id)
    const on = active?.id === p.id
    return (
      <Link key={p.id} href={pageHref(p, at)} data-tour={`nav-${p.id}`} className={`nav-item ${on ? 'active' : ''}`} aria-current={on ? 'page' : undefined} onClick={onNavigate}>
        {Ic && <Ic className="nav-icon" />}
        <span>{p.label}</span>
        {badge && <Count badge={badge} />}
        {tag && <span className="nav-count off">{tag}</span>}
        {(tag === null || p.locked) && <Lock className="nav-lock" role="img" aria-label="Con candado, viene en Cubeta" />}
      </Link>
    )
  }

  return (
    <nav className="nav" aria-label="Menú principal">
      {entries.map(e => {
        if (e.kind === 'page') return link(e.page, e.icon)
        const Ic = MENU_ICONS[e.icon]
        const isOpen = open.includes(e.id)
        const badge = isOpen ? null : e.pages.map(p => badgeOf(p.id)).find(Boolean)
        return (
          <div key={e.id} data-tour={`menu-${e.id}`}>
            <button type="button" className={`nav-item nav-group ${current === e.id ? 'inside' : ''}`} aria-expanded={isOpen} aria-controls={`menu-${e.id}`} onClick={() => toggle(e.id)}>
              <Ic className="nav-icon" />
              <span>{e.label}</span>
              {badge && <Count badge={badge} />}
              <ChevronDown className="nav-chev" aria-hidden="true" />
            </button>
            <div id={`menu-${e.id}`} className="nav-subs" hidden={!isOpen}>{e.pages.map(p => link(p))}</div>
          </div>
        )
      })}
    </nav>
  )
}

const Count = ({ badge }: { badge: MenuBadge }) => <span className={`nav-count ${badge.cls}`}>{badge.n > 99 ? '99+' : badge.n}</span>
