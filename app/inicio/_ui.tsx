import Link from 'next/link'
import s from './inicio.module.css'
import {
  Users, Activity, Megaphone, FlaskConical, Bell, Check, ArrowRight, Plus, Store, ShieldCheck, Layers, KeyRound, UserPlus,
  Link as LinkIcon, LayoutDashboard, MessageCircle, Calendar, Lock, Phone, Search, Download, EyeOff,
} from 'lucide-react'

/* Piezas compartidas del sitio de presentación (sin estado: sirven en páginas de servidor). */

/* Iconos de Lucide */
export const Ic = {
  contacts: Users, leads: Activity, megaphone: Megaphone, flask: FlaskConical, bell: Bell, check: Check, arrow: ArrowRight,
  plus: Plus, store: Store, shield: ShieldCheck, layers: Layers, key: KeyRound, users: UserPlus, link: LinkIcon,
  grid: LayoutDashboard, chat: MessageCircle, calendar: Calendar, lock: Lock, phone: Phone, search: Search,
  download: Download, eyeOff: EyeOff,
}

/** Encabezado de las páginas interiores: etiqueta, título y bajada, con el remolino de color de fondo. */
export function PageHero({ title, lead, children }: { title: React.ReactNode; lead: string; children?: React.ReactNode }) {
  return (
    <section className={s.pageHero}>
      <div className={s.pageHeroSwirl} aria-hidden="true"><i className={s.b1} /><i className={s.b3} /><i className={s.b4} /></div>
      <div className={`${s.wrap} ${s.pageHeroInner}`}>
        <h1 className={s.pageH1}>{title}</h1>
        <p className={s.lead}>{lead}</p>
        {children}
      </div>
    </section>
  )
}

/** Cierre con llamado a la acción, igual en todas las páginas. */
export function CtaBand({ title = 'Tu sucursal, organizada desde hoy', text = 'Crea tu cuenta gratis con el plan Litro y cambia de plan cuando tu tienda lo necesite.' }: { title?: string; text?: string }) {
  return (
    <section className={s.ctaSection}>
      <div className={s.wrap}>
        <div className={s.cta}>
          <div className={s.ctaSwirl} aria-hidden="true"><i className={s.b1} /><i className={s.b2} /><i className={s.b3} /><i className={s.b4} /><i className={s.b5} /></div>
          <div className={s.ctaInner}>
            <h2 className={s.h2}>{title}</h2>
            <p className={s.sub}>{text}</p>
            <div className={s.heroCtas}>
              <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>Crear cuenta gratis <Ic.arrow className={s.btnArrow} /></Link>
              <Link href="/inicio/precios" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Ver precios</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Lista con palomitas. */
export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className={s.bullets}>
      {items.map(b => <li key={b}><span className={s.bulletIcon}><Ic.check /></span>{b}</li>)}
    </ul>
  )
}

/** Título centrado de sección. */
export function SectionHead({ title, sub }: { title: React.ReactNode; sub?: string }) {
  return (
    <div className={s.center}>
      <h2 className={s.h2}>{title}</h2>
      {sub && <p className={s.sub}>{sub}</p>}
    </div>
  )
}

/** Enlace con flecha ("Ver todas las funciones →"). */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={s.moreLink}>{children}<Ic.arrow /></Link>
}
