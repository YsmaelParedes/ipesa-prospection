'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/profile'
import { ROLE_LABELS, STATUS_LABELS, type StoreModule } from '@/lib/stores'
import { Ico, Spinner, WhatsAppGlyph, cx } from './ui'
import { StoreTab } from './StoreTab'
import { ModulesTab } from './ModulesTab'
import { CatalogsTab } from './CatalogsTab'
import { TeamTab } from './TeamTab'
import { WhatsAppTab } from './WhatsAppTab'
import { PlanTab, STATUS_BADGE } from './PlanTab'
import { AccountTab } from './AccountTab'
import s from './configuracion.module.css'

type TabId = 'tienda' | 'herramientas' | 'catalogos' | 'equipo' | 'whatsapp' | 'plan' | 'cuenta'
const TABS: { id: TabId; label: string; hint: string; icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; admin?: boolean; module?: StoreModule }[] = [
  { id: 'tienda',       label: 'Tienda',       hint: 'Datos y logo',            icon: Ico.store, admin: true },
  { id: 'herramientas', label: 'Herramientas', hint: 'Módulos activos',         icon: Ico.grid, admin: true },
  { id: 'catalogos',    label: 'Catálogos',    hint: 'Segmentos y canales',     icon: Ico.tag },
  { id: 'equipo',       label: 'Equipo',       hint: 'Usuarios e invitaciones', icon: Ico.users, admin: true },
  { id: 'whatsapp',     label: 'WhatsApp',     hint: 'Conexión y respuestas',   icon: WhatsAppGlyph, admin: true, module: 'whatsapp' },
  { id: 'plan',         label: 'Plan',         hint: 'Prueba y suscripción',    icon: Ico.card, admin: true },
  { id: 'cuenta',       label: 'Mi cuenta',    hint: 'Nombre y contraseña',     icon: Ico.user },
]

export default function ConfiguracionPage() {
  return <Suspense fallback={<Spinner />}><Settings /></Suspense>
}

function Settings() {
  const session  = useSession()
  const params   = useSearchParams()
  const router   = useRouter()
  const pathname = usePathname()

  const store   = session?.store ?? null
  const isAdmin = !!session?.isAdmin
  const navRef  = useRef<HTMLElement>(null)
  const tabs = useMemo(
    () => TABS.filter(t => (!t.admin || isAdmin) && (!t.module || !!store?.modules[t.module])),
    [isAdmin, store],
  )

  const wanted = params.get('tab')
  const tab = tabs.find(t => t.id === wanted)?.id ?? (isAdmin ? 'tienda' : 'catalogos')

  // En celular las secciones se desplazan en horizontal: centrar la activa
  useEffect(() => {
    const nav = navRef.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && el && nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' })
    }
  }, [tab, tabs.length])

  if (!session || !store) return <Spinner />
  const go = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false })
  const location = [store.city, store.state].filter(Boolean).join(', ')

  return (
    <>
      <header className={s.storeHead}>
        <div className={s.storeLogo}><img src={store.logoUrl || '/ipesa-logo.png'} alt="" /></div>
        <div className={s.storeInfo}>
          <h2>{store.name}</h2>
          <p>{location || 'Agrega la ciudad y el estado de tu tienda'}</p>
        </div>
        <div className={s.storeChips}>
          <span className={cx(s.badge, STATUS_BADGE[store.status])}>
            <i />{STATUS_LABELS[store.status]}{store.status === 'trial' && store.access === 'full' && store.trialDaysLeft !== null ? ` · ${store.trialDaysLeft} d` : ''}
          </span>
          {session.role && <span className={cx(s.badge, s.bMuted)}>{ROLE_LABELS[session.role]}</span>}
        </div>
      </header>

      <div className={s.layout}>
        <nav className={s.nav} ref={navRef} aria-label="Secciones de configuración">
          {tabs.map(t => (
            <button key={t.id} className={cx(s.navItem, tab === t.id && s.navActive)} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <span className={s.navIcon}><t.icon /></span>
              <span className={s.navText}><strong>{t.label}</strong><small>{t.hint}</small></span>
            </button>
          ))}
        </nav>

        <div className={s.content} key={tab}>
          {tab === 'tienda'       && <StoreTab store={store} />}
          {tab === 'herramientas' && <ModulesTab store={store} />}
          {tab === 'catalogos'    && <CatalogsTab canEdit={isAdmin} />}
          {tab === 'equipo'       && <TeamTab store={store} isOwner={!!session.isOwner} />}
          {tab === 'whatsapp'     && <WhatsAppTab isOwner={!!session.isOwner} />}
          {tab === 'plan'         && <PlanTab store={store} />}
          {tab === 'cuenta'       && <AccountTab session={session} />}
        </div>
      </div>
    </>
  )
}
