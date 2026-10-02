import type { Metadata } from 'next'
import Link from 'next/link'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { TRIAL_DAYS, planOf, DEFAULT_PLAN } from '@/lib/stores'
import s from './inicio.module.css'

export const metadata: Metadata = {
  title: `${APP_NAME} · ${APP_TAGLINE}`,
  description: `Contactos, cotizaciones, WhatsApp y fórmulas de color en un solo lugar para tu tienda de pinturas. Prueba ${TRIAL_DAYS} días gratis.`,
}

const DEMO_STORE = 'Pinturas La Paleta'

/* Página de presentación: la ve quien entra a "/" sin sesión (ver proxy.ts). */

type IconProps = React.SVGProps<SVGSVGElement>
const icon = (d: React.ReactNode) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}
const Ic = {
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
}
function WhatsAppGlyph(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" />
    </svg>
  )
}

const MAX_USERS = planOf(DEFAULT_PLAN).maxUsers

const FEATURES = [
  { icon: Ic.contacts,  tone: s.tCyan,    title: 'Contactos y segmentos', text: 'Hogar, constructor, arquitecto, pintor o empresa. Encuentra a cualquier cliente en segundos e importa tu lista desde Excel.' },
  { icon: Ic.leads,     tone: s.tBrand,   title: 'Pipeline de ventas', text: 'De nuevo a cotizado y cerrado. Cada oportunidad con su monto, su historial y el siguiente paso.' },
  { icon: WhatsAppGlyph, tone: s.tWa,     title: 'WhatsApp dentro del CRM', text: 'Atiende desde el número de tu tienda. Cada conversación queda ligada a su contacto y a su lead.' },
  { icon: Ic.megaphone, tone: s.tMagenta, title: 'Campañas que cuidan tu número', text: 'Envía plantillas aprobadas por Meta con límites y pausas automáticas para evitar bloqueos.' },
  { icon: Ic.flask,     tone: s.tTeal,    title: 'Fórmulas de color', text: 'Consulta fórmulas de color convertidas a mililitros para igualar colores sin errores.' },
  { icon: Ic.bell,      tone: s.tAmber,   title: 'Recordatorios y avisos', text: 'Notificaciones en tu celular para que ningún seguimiento se quede pendiente.' },
]

const STEPS = [
  { title: 'Crea tu cuenta', text: 'Con tu correo, en menos de un minuto. Sin tarjeta.' },
  { title: 'Configura tu sucursal', text: 'Nombre, logo y herramientas. El asistente te guía paso a paso.' },
  { title: 'Invita a tu equipo', text: 'Manda a cada vendedor su enlace por WhatsApp y a vender.' },
]

const SECURITY = [
  { icon: Ic.layers, title: 'Datos separados por tienda', text: 'Cada consulta se filtra por tu tienda en el servidor. El navegador nunca entra directo a la base de datos.' },
  { icon: Ic.key,    title: 'Credenciales cifradas', text: 'Los tokens de tu WhatsApp se guardan cifrados con AES-256 y nunca regresan al navegador.' },
  { icon: Ic.users,  title: 'Roles y permisos', text: 'Dueño, administrador y vendedor: cada quien ve y hace solo lo que le corresponde.' },
  { icon: Ic.link,   title: 'Accesos bajo tu control', text: 'Invitaciones con enlace que vence y la opción de desactivar a quien ya no trabaje contigo.' },
]

const FAQ = [
  { q: '¿Necesito tarjeta para la prueba?', a: `No. Creas tu cuenta y usas todas las funciones durante ${TRIAL_DAYS} días, sin dejar datos de pago.` },
  { q: '¿Qué pasa cuando termina la prueba?', a: 'Tu información se conserva y tu equipo puede consultarla, pero para registrar clientes y enviar mensajes necesitas activar tu plan. La activación la hacemos contigo.' },
  { q: '¿Puedo usar el WhatsApp de mi tienda?', a: 'Sí. Se conecta con WhatsApp Business Platform, la API oficial de Meta, usando el número de tu sucursal. Desde Configuración te guiamos paso a paso.' },
  { q: '¿Cuántas personas pueden usarlo?', a: `El plan Profesional incluye hasta ${MAX_USERS} usuarios por tienda, con roles de dueño, administrador y vendedor.` },
  { q: '¿Otras tiendas pueden ver mis clientes?', a: 'No. Cada tienda tiene su propia información y solo la ve su equipo. Ninguna otra tienda puede acceder a ella.' },
  { q: 'Tengo varias sucursales, ¿cómo funciona?', a: 'Puedes dar de alta varias sucursales con la misma cuenta y cambiar entre ellas con un clic. Cada una tiene su equipo, su WhatsApp y sus datos.' },
  { q: '¿Funciona en el celular?', a: 'Sí. Funciona en cualquier navegador y puedes instalarlo como app en tu celular para recibir avisos de recordatorios y mensajes.' },
]

export default function LandingPage() {
  return (
    <div className={s.lp}>
      <div className="brand-line" aria-hidden="true" />

      {/* ── Navegación ── */}
      <header className={s.nav}>
        <div className={`${s.wrap} ${s.navInner}`}>
          <Link href="/inicio" className={s.navBrand} aria-label={`${APP_NAME}, inicio`}>
            <BrandLogo />
          </Link>
          <nav className={s.navLinks} aria-label="Secciones">
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#seguridad">Seguridad</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <div className={s.navCta}>
            <Link href="/login" className={`${s.btn} ${s.btnGhost}`}>Iniciar sesión</Link>
            <Link href="/registro" className={`${s.btn} ${s.btnPrimary}`}>
              <span className={s.hideXs}>Prueba gratis</span><span className={s.showXs}>Probar</span>
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className={s.hero}>
          <div className={`${s.wrap} ${s.heroGrid}`}>
            <div className={s.heroCopy}>
              <span className={s.eyebrow}><span className={s.eyebrowDot} />Para tiendas de pintura</span>
              <h1 className={s.h1}>El CRM hecho para tiendas <span className={s.spectrumText}>de pintura</span></h1>
              <p className={s.lead}>
                Contactos, cotizaciones, WhatsApp y fórmulas de color en un solo lugar. Tu equipo sabe a quién darle
                seguimiento hoy y tú ves cómo va la venta de tu sucursal.
              </p>
              <div className={s.heroCtas}>
                <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>
                  Prueba {TRIAL_DAYS} días gratis <Ic.arrow className={s.btnArrow} />
                </Link>
                <Link href="/login" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Ya tengo cuenta</Link>
              </div>
              <div className={s.checks}>
                <span><Ic.check />Sin tarjeta</span>
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
                    <span className={`${s.winNav} ${s.winNavOn}`}><Ic.grid />Dashboard</span>
                    <span className={s.winNav}><Ic.contacts />Contactos</span>
                    <span className={s.winNav}><Ic.leads />Leads</span>
                    <span className={s.winNav}><WhatsAppGlyph />WhatsApp<b>3</b></span>
                    <span className={s.winNav}><Ic.bell />Recordatorios</span>
                    <span className={s.winNav}><Ic.flask />Fórmulas</span>
                  </div>
                  <div className={s.winMain}>
                    <div className={s.dashHead}>
                      <div><small>Buenos días, Ana</small><strong>Dashboard</strong></div>
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
                        <span><b className={s.pCot} />Cotizado</span><span><b className={s.pCer} />Cerrado</span>
                      </div>
                    </div>
                    <div className={s.rows}>
                      <div className={s.row}><span className={`${s.av} ${s.avBrand}`}>KL</span><span className={s.rowName}>Karen López<small>Hogar</small></span><span className={`${s.stage} ${s.pCot}`}>Cotizado</span><strong>$4,850</strong></div>
                      <div className={s.row}><span className={`${s.av} ${s.avAmber}`}>CR</span><span className={s.rowName}>Constructora Ríos<small>Constructor</small></span><span className={`${s.stage} ${s.pSeg}`}>Seguimiento</span><strong>$38,200</strong></div>
                      <div className={s.row}><span className={`${s.av} ${s.avCyan}`}>AS</span><span className={s.rowName}>Arq. Andrea Solís<small>Arquitecto</small></span><span className={`${s.stage} ${s.pCer}`}>Cerrado</span><strong>$12,600</strong></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${s.float} ${s.chat}`}>
                <div className={s.chatHead}>
                  <span className={s.waBadge}><WhatsAppGlyph /></span>
                  <div><strong>Karen López</strong><small>en línea</small></div>
                </div>
                <p className={s.msgIn}>Hola, ¿tienen vinílica en color arena? Necesito 2 cubetas</p>
                <p className={s.msgOut}>¡Claro! Ya tengo tu fórmula, te paso el precio y te aparto el material <span className={s.ticks}>✓✓</span></p>
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
            <div className={s.stat}><strong>{TRIAL_DAYS} días</strong><span>de prueba con todas las funciones</span></div>
            <div className={s.stat}><strong>{MAX_USERS} usuarios</strong><span>por tienda en el plan Profesional</span></div>
            <div className={s.stat}><strong>API oficial</strong><span>de WhatsApp Business de Meta</span></div>
            <div className={s.stat}><strong>100% web</strong><span>y se instala como app en tu celular</span></div>
          </div>
        </section>

        {/* ── Funciones ── */}
        <section id="funciones" className={s.section}>
          <div className={s.wrap}>
            <div className={s.center}>
              <span className={s.kicker}>Funciones</span>
              <h2 className={s.h2}>Todo lo que pasa en el mostrador, ordenado</h2>
              <p className={s.sub}>
                Pensado para cómo vende una tienda de pinturas: muchos clientes, cotizaciones que van y vienen y
                conversaciones por WhatsApp todo el día.
              </p>
            </div>
            <div className={s.features}>
              {FEATURES.map(f => (
                <article key={f.title} className={s.feature}>
                  <span className={`${s.featureIcon} ${f.tone}`}><f.icon /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Configuración por tienda ── */}
        <section className={`${s.section} ${s.sectionAlt}`}>
          <div className={`${s.wrap} ${s.split}`}>
            <div>
              <span className={s.kicker}>Tu sucursal, a tu manera</span>
              <h2 className={s.h2}>Cada tienda configura lo suyo</h2>
              <p className={s.sub}>
                El nombre y logo de tu tienda, solo las herramientas que tu equipo usa y tus propios catálogos.
              </p>
              <ul className={s.bullets}>
                {[
                  'Logo y datos de tu sucursal',
                  'Activa o apaga WhatsApp, campañas y fórmulas',
                  'Segmentos y canales a la medida de tu tienda',
                  'Equipo con roles: dueño, administrador y vendedor',
                  '¿Varias sucursales? Cámbiate entre ellas con un clic',
                ].map(b => <li key={b}><span className={s.bulletIcon}><Ic.check /></span>{b}</li>)}
              </ul>
            </div>
            <div className={s.panels} aria-hidden="true">
              <div className={s.panel}>
                <div className={s.panelHead}><strong>Herramientas</strong><small>{DEMO_STORE}</small></div>
                <div className={s.toggleRow}><span className={`${s.tIcon} ${s.tWa}`}><WhatsAppGlyph /></span><span>WhatsApp<small>Bandeja ligada a contactos</small></span><i className={`${s.toggle} ${s.on}`} /></div>
                <div className={s.toggleRow}><span className={`${s.tIcon} ${s.tMagenta}`}><Ic.megaphone /></span><span>Campañas<small>Plantillas con reglas anti-bloqueo</small></span><i className={`${s.toggle} ${s.on}`} /></div>
                <div className={s.toggleRow}><span className={`${s.tIcon} ${s.tTeal}`}><Ic.flask /></span><span>Fórmulas<small>Igualación de colores en mL</small></span><i className={s.toggle} /></div>
              </div>
              <div className={`${s.panel} ${s.panelTeam}`}>
                <div className={s.panelHead}><strong>Equipo</strong><small>3 de {MAX_USERS} usuarios</small></div>
                <div className={s.memberRow}><span className={`${s.av} ${s.avBrand}`}>AM</span><span>Ana Martínez</span><em className={s.roleOwner}>Dueño</em></div>
                <div className={s.memberRow}><span className={`${s.av} ${s.avCyan}`}>LH</span><span>Luis Herrera</span><em className={s.roleAdmin}>Administrador</em></div>
                <div className={s.memberRow}><span className={`${s.av} ${s.avAmber}`}>SR</span><span>Sofía Ramos</span><em>Vendedor</em></div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Cómo funciona ── */}
        <section id="como-funciona" className={s.section}>
          <div className={s.wrap}>
            <div className={s.center}>
              <span className={s.kicker}>Cómo funciona</span>
              <h2 className={s.h2}>Empieza hoy, en tres pasos</h2>
            </div>
            <ol className={s.steps}>
              {STEPS.map((st, i) => (
                <li key={st.title} className={s.stepCard}>
                  <span className={`${s.stepNum} ${s[`n${i + 1}`]}`}>{i + 1}</span>
                  <h3>{st.title}</h3>
                  <p>{st.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Seguridad ── */}
        <section id="seguridad" className={`${s.section} ${s.dark}`}>
          <div className={`${s.wrap} ${s.secLayout}`}>
            <div className={s.secCopy}>
              <span className={s.kicker}>Seguridad</span>
              <h2 className={s.h2}>La información de tu tienda es solo de tu tienda</h2>
              <p className={s.sub}>
                La separación por tienda está construida desde la base de datos: ni otras sucursales ni otros usuarios
                pueden ver a tus clientes.
              </p>
              <div className={s.shieldArt} aria-hidden="true"><span><Ic.shield /></span></div>
            </div>
            <div className={s.secGrid}>
              {SECURITY.map(it => (
                <div key={it.title} className={s.secItem}>
                  <span className={s.secIcon}><it.icon /></span>
                  <h3>{it.title}</h3>
                  <p>{it.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Preguntas ── */}
        <section id="preguntas" className={s.section}>
          <div className={s.wrap}>
            <div className={s.center}>
              <span className={s.kicker}>Preguntas frecuentes</span>
              <h2 className={s.h2}>Lo que suelen preguntarnos</h2>
            </div>
            <div className={s.faq}>
              {FAQ.map(f => (
                <details key={f.q}>
                  <summary>{f.q}<span className={s.plus}><Ic.plus /></span></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Cierre ── */}
        <section className={s.ctaSection}>
          <div className={s.wrap}>
            <div className={s.cta}>
              <div className={s.ctaSwirl} aria-hidden="true"><i className={s.b1} /><i className={s.b2} /><i className={s.b3} /><i className={s.b4} /><i className={s.b5} /></div>
              <div className={s.ctaInner}>
                <h2 className={s.h2}>Tu sucursal, organizada desde hoy</h2>
                <p className={s.sub}>Pruébalo {TRIAL_DAYS} días con tu equipo. Sin tarjeta y sin compromiso.</p>
                <div className={s.heroCtas}>
                  <Link href="/registro" className={`${s.btn} ${s.btnPrimary} ${s.btnLg}`}>Crear mi cuenta <Ic.arrow className={s.btnArrow} /></Link>
                  <Link href="/login" className={`${s.btn} ${s.btnLight} ${s.btnLg}`}>Iniciar sesión</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.footer}>
        <div className={`${s.wrap} ${s.footInner}`}>
          <div className={s.footBrand}>
            <BrandLogo className={s.footLogo} />
            <span>{APP_TAGLINE}.</span>
          </div>
          <nav className={s.footLinks} aria-label="Enlaces">
            <Link href="/login">Iniciar sesión</Link>
            <Link href="/registro">Crear cuenta</Link>
            <Link href="/terminos">Términos</Link>
            <Link href="/privacidad">Aviso de privacidad</Link>
          </nav>
          <small className={s.copy}>© {new Date().getFullYear()} {APP_NAME}</small>
        </div>
      </footer>
    </div>
  )
}
