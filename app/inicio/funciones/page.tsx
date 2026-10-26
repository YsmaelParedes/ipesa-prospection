import type { Metadata } from 'next'
import { breadcrumbJsonLd, pageMeta } from '@/lib/site'
import { JsonLd } from '@/components/JsonLd'
import { APP_NAME } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { Bullets, CtaBand, Ic, MoreLink, PageHero } from '../_ui'
import { SingleDemo } from '../demos/DemoTabs'
import s from '../inicio.module.css'

export const metadata: Metadata = pageMeta({
  title: `Funciones · ${APP_NAME}`,
  description: 'Contactos por zonas, Sistema Comercial con metas por vendedor, agenda del día, equipo con permisos y avisos en el celular.',
  path: '/inicio/funciones',
})

const MAX_USERS = PLANS.galon.maxUsers

const JUMPS = [
  ['#contactos', 'Contactos'], ['#comercial', 'Sistema Comercial'], ['#agenda', 'Agenda'],
  ['#equipo', 'Equipo y permisos'], ['#avisos', 'Avisos'],
]

export default function FuncionesPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd('Funciones', '/inicio/funciones')} />
      <PageHero
        title={<>Todo tu mostrador, <span className={s.spectrumText}>en un solo lugar</span></>}
        lead="Cada parte de Matices está pensada para cómo vende una tienda de pinturas: muchos clientes, cotizaciones que van y vienen y seguimientos todo el día."
      >
        <nav className={s.jumps} aria-label="Ir a una función">
          {JUMPS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
      </PageHero>

      {/* Contactos */}
      <section id="contactos" className={s.section}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Tus clientes, ordenados por tipo</h2>
            <p className={s.sub}>Hogar, constructor, arquitecto, pintor o empresa: cada cliente con su segmento, su zona, cómo te conoció y su historial.</p>
            <Bullets items={['Búsqueda sin acentos por nombre o teléfono', 'Sabes quién tiene WhatsApp y quién es fijo', 'Importa tu lista de Excel en un paso', 'Toda la historia del cliente en su ficha']} />
            <MoreLink href="/inicio/contactos">Conoce Contactos</MoreLink>
          </div>
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockSearch}><Ic.search />Buscar nombre o teléfono…</div>
            {[
              ['KL', 'Karen López', 'Hogar', s.avBrand, s.segHogar],
              ['CR', 'Constructora Ríos', 'Constructor', s.avAmber, s.segCons],
              ['AS', 'Arq. Andrea Solís', 'Arquitecto', s.avCyan, s.segArq],
              ['HP', 'Hotel Las Palmas', 'Empresa', s.avPurple, s.segEmp],
            ].map(([ini, name, seg, av, tone]) => (
              <div key={name} className={s.mockRow}>
                <span className={`${s.av} ${av}`}>{ini}</span>
                <span className={s.rowName}>{name}<small>222 ••• ••••</small></span>
                <span className={`${s.segChip} ${tone}`}><i />{seg}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sistema Comercial */}
      <section id="comercial" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <h2 className={s.h2}>Cada llamada, registrada en 3 toques</h2>
            <p className={s.sub}>Tu equipo abre la app y ve a quién llamar hoy. Registra cómo le fue y Matices le sugiere cuándo volver a contactar. Pruébalo:</p>
          </div>
          <div className={s.demoWrap}><SingleDemo k="call" /></div>
          <div className={s.centerLink}><MoreLink href="/inicio/sistema-comercial">Conoce el Sistema Comercial</MoreLink></div>
        </div>
      </section>

      {/* Agenda */}
      <section id="agenda" className={s.section}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <h2 className={s.h2}>Lo que toca hoy, al abrir la app</h2>
            <p className={s.sub}>Llamadas, visitas y cotizaciones que esperan respuesta, con hora. Nada se queda en un papelito.</p>
            <Bullets items={['"Para hoy" con lo vencido y lo del día', 'Recordatorios ligados al cliente y a su cotización', 'Resumen cada mañana en tu celular']} />
          </div>
          <div className={s.mock} aria-hidden="true">
            <div className={s.mockHead}><strong>Para hoy</strong><small>3 pendientes</small></div>
            {[
              ['10:00', 'Llamar a Karen López', 'Confirmar color de la sala', s.tagCall],
              ['12:30', 'Enviar precio a Constructora Ríos', 'Cotización por volumen', s.tagQuote],
              ['16:00', 'Visita a Hotel Las Palmas', 'Revisar la obra', s.tagVisit],
            ].map(([time, title, sub, tag], i) => (
              <div key={title} className={`${s.agendaRow} ${i === 0 ? s.agendaDone : ''}`}>
                <span className={`${s.agendaTime} ${tag}`}>{time}</span>
                <span className={s.rowName}>{title}<small>{sub}</small></span>
                <span className={s.agendaCheck}><Ic.check /></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo y permisos */}
      <section id="equipo" className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <h2 className={s.h2}>Tu equipo vende. Tu base se queda en tu tienda.</h2>
            <p className={s.sub}>{`Tú y ${MAX_USERS - 1} vendedores, cada uno con su usuario. Cada vendedor trabaja sus clientes y su agenda; los administradores ven todo.`}</p>
            <Bullets items={[
              'Exportar a Excel, importar y borrar contactos: solo administradores',
              'Los vendedores no pueden seleccionar, copiar ni imprimir la información',
              'Marca de agua con el nombre de cada vendedor en su pantalla',
              'Desactiva el acceso de quien ya no trabaje contigo',
            ]} />
          </div>
          <div className={s.panels} aria-hidden="true">
            <div className={s.panel}>
              <div className={s.panelHead}><strong>Equipo</strong><small>3 de {MAX_USERS} usuarios</small></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avBrand}`}>AM</span><span>Ana Martínez</span><em className={s.roleOwner}>Administrador</em></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avCyan}`}>LH</span><span>Luis Herrera</span><em>Vendedor</em></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avAmber}`}>SR</span><span>Sofía Ramos</span><em>Vendedor</em></div>
            </div>
            <div className={`${s.panel} ${s.panelTeam}`}>
              <div className={s.panelHead}><strong>Permisos del vendedor</strong></div>
              <div className={s.permRow}><Ic.download /><span>Exportar a Excel</span><em className={s.permNo}>Solo administradores</em></div>
              <div className={s.permRow}><Ic.lock /><span>Borrar contactos</span><em className={s.permNo}>Solo administradores</em></div>
              <div className={s.permRow}><Ic.eyeOff /><span>Copiar e imprimir</span><em className={s.permNo}>Bloqueado</em></div>
              <div className={s.permRow}><Ic.contacts /><span>Atender a los clientes</span><em className={s.permYes}>Permitido</em></div>
            </div>
          </div>
        </div>
      </section>

      {/* Avisos */}
      <section id="avisos" className={s.section}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <h2 className={s.h2}>Tus pendientes en el celular, aunque la app esté cerrada</h2>
            <p className={s.sub}>Instálala como app en tu celular y recibe cada mañana el resumen de tu día.</p>
            <Bullets items={['Resumen de pendientes cada mañana', 'Funciona en Android y en iPhone (agregada a la pantalla de inicio)']} />
          </div>
          <div className={s.phone} aria-hidden="true">
            <div className={s.phoneNotch} />
            <div className={s.notif}><span className={s.notifIcon}><Ic.calendar /></span><div><strong>{APP_NAME} · 8:00</strong><span>Hoy tienes 3 pendientes y 1 visita</span></div></div>
          </div>
        </div>
      </section>

      <CtaBand title="¿Lo quieres en tu tienda?" />
    </>
  )
}
