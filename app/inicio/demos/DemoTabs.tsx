'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CallDemo } from './CallDemo'
import { ContactsDemo } from './ContactsDemo'
import { TeamDemo } from './TeamDemo'
import s from './demos.module.css'

/** Las demos del sitio. En la portada van en pestañas; cada página de producto muestra la suya. */
export type DemoKey = 'call' | 'contacts' | 'team'

const icon = (d: React.ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>

const DEMOS: Record<DemoKey, {
  tab: string; icon: React.ReactNode; title: string; text: string; steps: string[]; tryIt: string; href: string; more: string
  Demo: () => React.ReactElement
}> = {
  call: {
    tab: 'Registrar una llamada', icon: icon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />),
    title: 'Registrar una llamada', text: 'Así trabaja un vendedor en la pantalla Hoy del Sistema Comercial.',
    steps: ['Toca a un cliente de tu lista.', 'Elige cómo te fue.', 'Acepta la fecha que te sugerimos y guarda.'],
    tryIt: 'Pruébalo: registra una «Cotización» y mira cómo avanza tu meta.', href: '/inicio/sistema-comercial', more: 'Conoce el Sistema Comercial',
    Demo: CallDemo,
  },
  contacts: {
    tab: 'Contactos', icon: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
    title: 'Contactos', text: 'Encuentra a cualquier cliente aunque escribas sin acentos, y sabe si tiene WhatsApp o hay que llamarle.',
    steps: ['Escribe «jose» o «ferre».', 'Filtra por WhatsApp, fijo o sin teléfono.', 'Toca un contacto para ver su ficha.'],
    tryIt: 'Pruébalo: escribe «jose» y encuentra a José.', href: '/inicio/contactos', more: 'Conoce Contactos',
    Demo: ContactsDemo,
  },
  team: {
    tab: 'Equipo y metas', icon: icon(<><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>),
    title: 'Equipo y metas', text: 'El administrador ve a cada vendedor contra su meta del día.',
    steps: ['Registra una venta de un vendedor.', 'Cambia la meta diaria.', 'Mira cómo se mueven las barras.'],
    tryIt: 'Pruébalo: baja la meta a 20 y ve quién la cumple.', href: '/inicio/sistema-comercial#equipo', more: 'Conoce Equipo',
    Demo: TeamDemo,
  },
}
const ORDER: DemoKey[] = ['call', 'contacts', 'team']

function Side({ k, link }: { k: DemoKey; link: boolean }) {
  const d = DEMOS[k]
  return (
    <aside className={s.side}>
      <h3>{d.title}</h3>
      <p>{d.text}</p>
      <ol>{d.steps.map(x => <li key={x}>{x}</li>)}</ol>
      <div className={s.try}>{d.tryIt}</div>
      {link && <Link href={d.href} className={s.sideLink}>{d.more} →</Link>}
    </aside>
  )
}

/** Portada: las demos en pestañas (flechas para cambiar de pestaña). `bare`: sin la explicación de al lado. */
export function DemoTabs({ bare = false }: { bare?: boolean }) {
  const [active, setActive] = useState<DemoKey>('call')
  const refs = useRef<Partial<Record<DemoKey, HTMLButtonElement | null>>>({})
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const i = ORDER.indexOf(active)
    const next = ORDER[(i + (e.key === 'ArrowRight' ? 1 : ORDER.length - 1)) % ORDER.length]
    setActive(next)
    refs.current[next]?.focus()
  }
  const { Demo } = DEMOS[active]
  return (
    <div>
      <div className={s.tabs} role="tablist" aria-label="Demos de Matices" onKeyDown={onKey}>
        {ORDER.map(k => (
          <button
            key={k} ref={el => { refs.current[k] = el }} type="button" role="tab" id={`demo-tab-${k}`}
            aria-selected={active === k} aria-controls="demo-panel" tabIndex={active === k ? 0 : -1}
            className={`${s.tab} ${s.press}`} onClick={() => setActive(k)} data-demo-tab={k}
          >
            {DEMOS[k].icon}{DEMOS[k].tab}
          </button>
        ))}
      </div>
      <div className={`${s.layout} ${bare ? s.single : ''}`}>
        <div className={s.stage} role="tabpanel" id="demo-panel" aria-labelledby={`demo-tab-${active}`}>
          <Demo key={active} />
        </div>
        {!bare && <Side k={active} link />}
      </div>
    </div>
  )
}

/** Una sola demo con su explicación (páginas de producto). */
export function SingleDemo({ k }: { k: DemoKey }) {
  const { Demo } = DEMOS[k]
  return (
    <div className={s.layout}>
      <div className={s.stage}><Demo /></div>
      <Side k={k} link={false} />
    </div>
  )
}
