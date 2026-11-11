'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { CallDemo } from './CallDemo'
import { ContactsDemo } from './ContactsDemo'
import { TeamDemo } from './TeamDemo'
import s from './demos.module.css'
import { ChartColumn, Phone, Users } from 'lucide-react'

/** Las demos del sitio. En la portada van en pestañas; cada página de producto muestra la suya. */
export type DemoKey = 'call' | 'contacts' | 'team'


const DEMOS: Record<DemoKey, {
  tab: string; icon: React.ReactNode; title: string; text: string; steps: string[]; tryIt: string; href: string; more: string
  Demo: () => React.ReactElement
}> = {
  call: {
    tab: 'Registrar una llamada', icon: <Phone aria-hidden="true" />,
    title: 'Registrar una llamada', text: 'Así trabaja un vendedor en la pantalla Hoy del Sistema Comercial.',
    steps: ['Toca a un cliente de tu lista.', 'Elige cómo te fue.', 'Acepta la fecha que te sugerimos y guarda.'],
    tryIt: 'Pruébalo: registra una «Cotización» y mira cómo avanza tu meta.', href: '/inicio/sistema-comercial', more: 'Conoce el Sistema Comercial',
    Demo: CallDemo,
  },
  contacts: {
    tab: 'Contactos', icon: <Users aria-hidden="true" />,
    title: 'Contactos', text: 'Encuentra a cualquier cliente aunque escribas sin acentos, y sabe si tiene WhatsApp o hay que llamarle.',
    steps: ['Escribe «jose» o «ferre».', 'Filtra por WhatsApp, fijo o sin teléfono.', 'Toca un contacto para ver su ficha.'],
    tryIt: 'Pruébalo: escribe «jose» y encuentra a José.', href: '/inicio/contactos', more: 'Conoce Contactos',
    Demo: ContactsDemo,
  },
  team: {
    tab: 'Equipo y metas', icon: <ChartColumn aria-hidden="true" />,
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
