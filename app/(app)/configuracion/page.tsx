'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/lib/profile'
import { WHATSAPP_OFFERED, type StoreModule } from '@/lib/stores'
import { Ico, SectionHead, Spinner, WhatsAppGlyph, cx } from './ui'
import { StoreTab } from './StoreTab'
import { CatalogsTab } from './CatalogsTab'
import { TeamTab } from './TeamTab'
import { WhatsAppTab } from './WhatsAppTab'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { PlanTab } from './PlanTab'
import { ProfileTab, SecurityTab } from './AccountTab'
import { NotificationsPanel } from './NotificationsPanel'
import s from './configuracion.module.css'

type TabId = 'perfil' | 'avisos' | 'seguridad' | 'tienda' | 'equipo' | 'catalogos' | 'whatsapp' | 'plan'
type Tab = {
  id: TabId; label: string; description: string; group: 'cuenta' | 'tienda'
  icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; admin?: boolean; module?: StoreModule
}

/* Arriba lo de cada persona; abajo lo que toca a toda la tienda */
const TABS: Tab[] = [
  { id: 'perfil',    group: 'cuenta', label: 'Perfil',       icon: Ico.user,  description: 'Cómo te ve tu equipo y a qué tiendas tienes acceso.' },
  { id: 'avisos',    group: 'cuenta', label: 'Avisos',       icon: Ico.bell,  description: 'Recordatorios a su hora, tu agenda a las 8:00 y mensajes de clientes, aunque la app esté cerrada.' },
  { id: 'seguridad', group: 'cuenta', label: 'Seguridad',    icon: Ico.lock,  description: 'Tu contraseña y tu sesión en este dispositivo.' },
  { id: 'tienda',    group: 'tienda', label: 'General',      icon: Ico.store, admin: true, description: 'Los datos de tu tienda. Tu equipo ve el nombre y el logo en el menú.' },
  { id: 'equipo',    group: 'tienda', label: 'Equipo',       icon: Ico.users, admin: true, description: 'Quién tiene acceso a esta tienda y con qué rol.' },
  { id: 'catalogos', group: 'tienda', label: 'Catálogos',    icon: Ico.tag,   description: 'Las opciones con las que tu equipo clasifica a sus contactos.' },
  // Sin WhatsApp activo se muestra igual (a los administradores), para ofrecerlo
  { id: 'whatsapp',  group: 'tienda', label: 'WhatsApp',     icon: WhatsAppGlyph, admin: true, description: 'El número de tu tienda y las respuestas rápidas del equipo.' },
  { id: 'plan',      group: 'tienda', label: 'Plan y pagos', icon: Ico.card,  admin: true, description: 'Tu plan, lo que usas de él y tu suscripción.' },
]
const GROUPS = [{ id: 'cuenta', label: 'Tu cuenta' }, { id: 'tienda', label: 'Tienda' }] as const
/** Direcciones de antes que siguen llegando desde avisos y correos. */
const ALIASES: Record<string, TabId> = { cuenta: 'perfil' }

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

  const raw = params.get('tab') ?? ''
  const wanted = ALIASES[raw] ?? raw
  const current = tabs.find(t => t.id === wanted) ?? tabs.find(t => t.id === (isAdmin ? 'tienda' : 'perfil')) ?? tabs[0]
  const tab = current.id

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
  const waHint = (t: Tab) => t.id === 'whatsapp' && !store.modules.whatsapp
    ? (!WHATSAPP_OFFERED ? 'Pronto' : store.planIncludesWhatsApp ? 'Por activar' : null)
    : null

  return (
    <div className={s.layout}>
      <nav className={s.nav} ref={navRef} aria-label="Secciones de configuración">
        {GROUPS.map(g => {
          const items = tabs.filter(t => t.group === g.id)
          if (!items.length) return null
          return (
            <div key={g.id} className={s.navGroup}>
              <div className={s.navLabel}>{g.label}</div>
              {items.map(t => {
                const hint = waHint(t)
                return (
                  <button key={t.id} className={cx(s.navItem, tab === t.id && s.navActive)} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                    <t.icon className={s.navIcon} />
                    <span className={s.navText}>{t.label}</span>
                    {hint && <span className={s.navTag}>{hint}</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className={s.content} key={tab}>
        <SectionHead title={current.label} description={current.description} />
        {tab === 'perfil'    && <ProfileTab session={session} />}
        {tab === 'avisos'    && <NotificationsPanel />}
        {tab === 'seguridad' && <SecurityTab />}
        {tab === 'tienda'    && <StoreTab store={store} />}
        {tab === 'catalogos' && <CatalogsTab canEdit={isAdmin} />}
        {tab === 'equipo'    && <TeamTab store={store} />}
        {tab === 'whatsapp'  && (store.modules.whatsapp ? <WhatsAppTab /> : <WhatsAppOffer />)}
        {tab === 'plan'      && <PlanTab store={store} />}
      </div>
    </div>
  )
}
