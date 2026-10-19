import Link from 'next/link'
import s from './inicio.module.css'

/* Piezas compartidas del sitio de presentación (sin estado: sirven en páginas de servidor). */

type IconProps = React.SVGProps<SVGSVGElement>
const icon = (d: React.ReactNode) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}

export const Ic = {
  contacts: icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  leads:    icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  megaphone: icon(<><path d="m3 11 18-5v12L3 14v-3Z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  flask:    icon(<><path d="M9 2v6.3a2 2 0 0 1-.3 1L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2" /><path d="M7 2h10M6 14h12" /></>),
  bell:     icon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  check:    icon(<path d="m5 13 4 4L19 7" />),
  arrow:    icon(<path d="M5 12h14M13 6l6 6-6 6" />),
  plus:     icon(<path d="M12 5v14M5 12h14" />),
  store:    icon(<><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /></>),
  shield:   icon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>),
  layers:   icon(<><path d="m12 2 10 5-10 5L2 7l10-5Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></>),
  key:      icon(<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>),
  users:    icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>),
  link:     icon(<><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>),
  grid:     icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  chat:     icon(<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" />),
  calendar: icon(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  lock:     icon(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  phone:    icon(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />),
  search:   icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  download: icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>),
  eyeOff:   icon(<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M1 1l22 22" /></>),
}

/** Encabezado de las páginas interiores: etiqueta, título y bajada, con el remolino de color de fondo. */
export function PageHero({ kicker, title, lead, children }: { kicker: string; title: React.ReactNode; lead: string; children?: React.ReactNode }) {
  return (
    <section className={s.pageHero}>
      <div className={s.pageHeroSwirl} aria-hidden="true"><i className={s.b1} /><i className={s.b3} /><i className={s.b4} /></div>
      <div className={`${s.wrap} ${s.pageHeroInner}`}>
        <span className={s.eyebrow}><span className={s.eyebrowDot} />{kicker}</span>
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

/** Título centrado de sección. */
export function SectionHead({ kicker, title, sub }: { kicker: string; title: React.ReactNode; sub?: string }) {
  return (
    <div className={s.center}>
      <span className={s.kicker}>{kicker}</span>
      <h2 className={s.h2}>{title}</h2>
      {sub && <p className={s.sub}>{sub}</p>}
    </div>
  )
}

/** Enlace con flecha ("Ver todas las funciones →"). */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className={s.moreLink}>{children}<Ic.arrow /></Link>
}
