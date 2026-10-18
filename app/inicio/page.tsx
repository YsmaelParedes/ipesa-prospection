import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { planOf, DEFAULT_PLAN } from '@/lib/stores'
import { CtaBand, Ic, MoreLink, SectionHead } from './_ui'
import { LeadsDemo } from './LeadsDemo'
import s from './inicio.module.css'

export const metadata: Metadata = {
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: 'Contactos, cotizaciones, agenda y fórmulas de color en un solo lugar para tu tienda de pinturas. Alta por invitación.',
}

const DEMO_STORE = 'Pinturas La Paleta'
const MAX_USERS = planOf(DEFAULT_PLAN).maxUsers

/* Inicio del sitio de presentación: lo ve quien entra a "/" sin sesión (ver proxy.ts). */

const FEATURES = [
  { icon: Ic.contacts,  tone: s.tCyan,    title: 'Contactos y segmentos', text: 'Hogar, constructor, arquitecto, pintor o empresa. Encuentra a cualquier cliente en segundos.', href: '/inicio/funciones#contactos' },
  { icon: Ic.leads,     tone: s.tBrand,   title: 'Cotizaciones con seguimiento', text: 'De nuevo a cotizado y ganado. Cada oportunidad con su monto y su siguiente paso.', href: '/inicio/funciones#leads' },
  { icon: Ic.grid,      tone: s.tAmber,   title: 'Lo que toca hoy', text: 'Al abrir, tu equipo ve a quién llamar, qué cotización espera respuesta y qué visitas tiene.', href: '/inicio/funciones#agenda' },
  { icon: Ic.users,     tone: s.tMagenta, title: 'Tu equipo y tu base, protegidos', text: 'Cada vendedor con su usuario. Exportar y borrar, solo tú.', href: '/inicio/funciones#equipo' },
  { icon: Ic.flask,     tone: s.tTeal,    title: 'Fórmulas de color', text: 'Fórmulas convertidas a mililitros para igualar colores sin errores.', href: '/inicio/funciones#formulas' },
  { icon: Ic.chat,      tone: s.tWa,      title: 'WhatsApp en el CRM', text: 'Servicio adicional: atiende y manda promociones desde el número de tu tienda.', href: '/inicio/whatsapp' },
]

const STEPS = [
  { title: 'Pide tu invitación', text: 'Acordamos contigo el plan, damos de alta tu tienda y te mandamos tu enlace.' },
  { title: 'Configura tu sucursal', text: 'Nombre, logo y catálogos. El asistente te guía paso a paso.' },
  { title: 'Invita a tu equipo', text: 'Manda a cada vendedor su enlace por WhatsApp o correo y a vender.' },
]

export default function LandingPage() {
  return (
    <>
      {/* ── Presentación ── */}
      <section className={s.hero}>
        <div className={`${s.wrap} ${s.heroGrid}`}>
          <div className={s.heroCopy}>
            <span className={s.eyebrow}><span className={s.eyebrowDot} />Para tiendas de pintura</span>
            <h1 className={s.h1}>El CRM hecho para tiendas <span className={s.spectrumText}>de pintura</span></h1>
            <p className={s.lead}>
              Contactos, cotizaciones, agenda y fórmulas de color en un solo lugar. Tu equipo sabe a quién darle
              seguimiento hoy y tú ves cómo va la venta de tu sucursal.
            </p>
            <div className={s.heroCtas}>
              <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
                Quiero usarlo en mi tienda <Ic.arrow className={s.btnArrow} />
              </Link>
              <a href="#demo" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Pruébalo aquí abajo</a>
            </div>
            <div className={s.checks}>
              <span><Ic.check />Te ayudamos a configurarlo</span>
              <span><Ic.check />Lista en minutos</span>
              <span><Ic.check />Celular y computadora</span>
            </div>
          </div>

          <div className={s.visual} aria-hidden="true">
            <div className={s.swirl}><i className={s.b1} /><i className={s.b2} /><i className={s.b3} /><i className={s.b4} /><i className={s.b5} /></div>

            <div className={s.window}>
              <div className={s.winBar}><i /><i /><i /><span>{APP_NAME}</span></div>
              <div className={s.winBody}>
                <div className={s.winSide}>
                  <BrandLogo className={s.winLogo} />
                  <span className={s.winStore}><Ic.store />{DEMO_STORE}</span>
                  <span className={`${s.winNav} ${s.winNavOn}`}><Ic.grid />Inicio</span>
                  <span className={s.winNav}><Ic.contacts />Contactos</span>
                  <span className={s.winNav}><Ic.leads />Leads</span>
                  <span className={s.winNav}><Ic.bell />Agenda<b>3</b></span>
                  <span className={s.winNav}><Ic.flask />Fórmulas</span>
                </div>
                <div className={s.winMain}>
                  <div className={s.dashHead}>
                    <div><small>Buenos días, Ana</small><strong>Inicio</strong></div>
                    <span className={s.weekPill}>Esta semana</span>
                  </div>
                  <div className={s.kpis}>
                    <div className={s.kpi}><small>Leads activos</small><strong>48</strong><em className={s.up}>+12% este mes</em></div>
                    <div className={s.kpi}><small>En cotización</small><strong>$186,400</strong><em>23 oportunidades</em></div>
                    <div className={s.kpi}><small>Cerrados</small><strong>21</strong><em className={s.up}>32% de cierre</em></div>
                  </div>
                  <div className={s.pipe}>
                    <div className={s.pipeTop}><strong>Pipeline</strong><small>148 leads</small></div>
                    <div className={s.pipeBar}><i className={s.pNuevo} /><i className={s.pSeg} /><i className={s.pCot} /><i className={s.pCer} /></div>
                    <div className={s.pipeLegend}>
                      <span><b className={s.pNuevo} />Nuevo</span><span><b className={s.pSeg} />Seguimiento</span>
                      <span><b className={s.pCot} />Cotizado</span><span><b className={s.pCer} />Ganado</span>
                    </div>
                  </div>
                  <div className={s.rows}>
                    <div className={s.row}><span className={`${s.av} ${s.avBrand}`}>KL</span><span className={s.rowName}>Karen López<small>Hogar</small></span><span className={`${s.stage} ${s.pCot}`}>Cotizado</span><strong>$4,850</strong></div>
                    <div className={s.row}><span className={`${s.av} ${s.avAmber}`}>CR</span><span className={s.rowName}>Constructora Ríos<small>Constructor</small></span><span className={`${s.stage} ${s.pSeg}`}>Seguimiento</span><strong>$38,200</strong></div>
                    <div className={s.row}><span className={`${s.av} ${s.avCyan}`}>AS</span><span className={s.rowName}>Arq. Andrea Solís<small>Arquitecto</small></span><span className={`${s.stage} ${s.pCer}`}>Ganado</span><strong>$12,600</strong></div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${s.float} ${s.chat}`}>
              <div className={s.chatHead}>
                <span className={`${s.waBadge} ${s.todayBadge}`}><Ic.bell /></span>
                <div><strong>Para hoy</strong><small>3 seguimientos</small></div>
              </div>
              <p className={s.msgIn}>11:00 · Llamar a Karen López para confirmar su cotización de vinílica arena</p>
              <p className={s.msgIn}>13:30 · Enviar precio a Constructora Ríos</p>
              <div className={s.chatLinked}><Ic.link />Ligado a su lead · $4,850</div>
            </div>

            <div className={`${s.float} ${s.formula}`}>
              <div className={s.formulaHead}>
                <span className={s.swatch} />
                <div><small>Fórmula · cubeta 19 L</small><strong>Arena del desierto</strong></div>
              </div>
              <ul className={s.formulaList}>
                <li><b style={{ background: '#C99A2E' }} />Óxido amarillo<span>38 mL</span></li>
                <li><b style={{ background: '#A8432B' }} />Óxido rojo<span>9 mL</span></li>
                <li><b style={{ background: '#2B2B2B' }} />Negro<span>4 mL</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Datos rápidos ── */}
      <section className={s.strip} aria-label="En resumen">
        <div className={`${s.wrap} ${s.stripGrid}`}>
          <div className={s.stat}><strong>A tu medida</strong><span>precio acordado con cada tienda</span></div>
          <div className={s.stat}><strong>{MAX_USERS} usuarios</strong><span>por tienda en el plan Profesional</span></div>
          <div className={s.stat}><strong>Tus datos</strong><span>separados y protegidos por tienda</span></div>
          <div className={s.stat}><strong>100% web</strong><span>y se instala como app en tu celular</span></div>
        </div>
      </section>

      {/* ── Demo de Leads ── */}
      <section id="demo" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead
            kicker="Pruébalo aquí mismo"
            title="Mueve una cotización y mira cómo cambia tu venta"
            sub="Así se ven tus oportunidades en Matices. Toca una tarjeta para cambiarla de etapa (o arrástrala en computadora): las cifras se actualizan al momento."
          />
          <div className={s.demoWrap}><LeadsDemo /></div>
        </div>
      </section>

      {/* ── Funciones ── */}
      <section className={s.section}>
        <div className={s.wrap}>
          <SectionHead
            kicker="Funciones"
            title="Todo lo que pasa en el mostrador, ordenado"
            sub="Pensado para cómo vende una tienda de pinturas: muchos clientes, cotizaciones que van y vienen y seguimientos todo el día."
          />
          <div className={s.features}>
            {FEATURES.map(f => (
              <Link key={f.title} href={f.href} className={s.feature}>
                <span className={`${s.featureIcon} ${f.tone}`}><f.icon /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <span className={s.featureMore}>Ver más <Ic.arrow /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo empezar ── */}
      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <SectionHead kicker="Cómo empezar" title="Empieza hoy, en tres pasos" />
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.stepCard}>
                <span className={`${s.stepNum} ${s[`n${i + 1}`]}`}>{i + 1}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
          <div className={s.centerLink}><MoreLink href="/inicio/como-empezar">Planes, seguridad y requisitos</MoreLink></div>
        </div>
      </section>

      <CtaBand />
    </>
  )
}
