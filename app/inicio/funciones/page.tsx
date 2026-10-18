import type { Metadata } from 'next'
import { APP_NAME } from '@/lib/brand'
import { PLANS } from '@/lib/stores'
import { CtaBand, Ic, PageHero } from '../_ui'
import { LeadsDemo } from '../LeadsDemo'
import s from '../inicio.module.css'

export const metadata: Metadata = {
  title: `Funciones · ${APP_NAME}`,
  description: 'Contactos con segmentos, cotizaciones con seguimiento, agenda del día, equipo con permisos, fórmulas de color y avisos en el celular.',
}

const MAX_USERS = PLANS.galon.maxUsers

const JUMPS = [
  ['#contactos', 'Contactos'], ['#leads', 'Cotizaciones'], ['#agenda', 'Agenda'],
  ['#equipo', 'Equipo y permisos'], ['#formulas', 'Fórmulas'], ['#avisos', 'Avisos'],
]

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className={s.bullets}>
      {items.map(b => <li key={b}><span className={s.bulletIcon}><Ic.check /></span>{b}</li>)}
    </ul>
  )
}

export default function FuncionesPage() {
  return (
    <>
      <PageHero
        kicker="Funciones"
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
            <span className={s.kicker}>Contactos</span>
            <h2 className={s.h2}>Tus clientes, ordenados por tipo</h2>
            <p className={s.sub}>Hogar, constructor, arquitecto, pintor o empresa: cada cliente con su segmento, cómo te conoció y su historial de cotizaciones.</p>
            <Bullets items={['Búsqueda por nombre o teléfono en segundos', 'Segmentos y canales a la medida de tu tienda', 'Importa tu lista de Excel en un paso', 'Toda la historia del cliente en su ficha']} />
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

      {/* Cotizaciones */}
      <section id="leads" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.wrap}>
          <div className={s.center}>
            <span className={s.kicker}>Cotizaciones</span>
            <h2 className={s.h2}>Cada cotización, con su siguiente paso</h2>
            <p className={s.sub}>De nuevo a cotizado y ganado. Ves cuánto tienes en juego, qué espera respuesta y cuánto vendiste. Pruébalo:</p>
          </div>
          <div className={s.demoWrap}><LeadsDemo /></div>
        </div>
      </section>

      {/* Agenda */}
      <section id="agenda" className={s.section}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <span className={s.kicker}>Agenda</span>
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
            <span className={s.kicker}>Equipo y permisos</span>
            <h2 className={s.h2}>Tu equipo vende. Tu base se queda contigo.</h2>
            <p className={s.sub}>{`Tú y ${MAX_USERS - 1} vendedores, cada uno con su usuario. Cada vendedor trabaja sus leads y su agenda; tú ves todo.`}</p>
            <Bullets items={[
              'Exportar a Excel, importar y borrar contactos: solo tú',
              'Los vendedores no pueden seleccionar, copiar ni imprimir la información',
              'Marca de agua con el nombre de cada vendedor en su pantalla',
              'Desactiva el acceso de quien ya no trabaje contigo',
            ]} />
          </div>
          <div className={s.panels} aria-hidden="true">
            <div className={s.panel}>
              <div className={s.panelHead}><strong>Equipo</strong><small>3 de {MAX_USERS} usuarios</small></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avBrand}`}>AM</span><span>Ana Martínez</span><em className={s.roleOwner}>Dueño</em></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avCyan}`}>LH</span><span>Luis Herrera</span><em>Vendedor</em></div>
              <div className={s.memberRow}><span className={`${s.av} ${s.avAmber}`}>SR</span><span>Sofía Ramos</span><em>Vendedor</em></div>
            </div>
            <div className={`${s.panel} ${s.panelTeam}`}>
              <div className={s.panelHead}><strong>Permisos del vendedor</strong></div>
              <div className={s.permRow}><Ic.download /><span>Exportar a Excel</span><em className={s.permNo}>Solo dueño</em></div>
              <div className={s.permRow}><Ic.lock /><span>Borrar contactos</span><em className={s.permNo}>Solo dueño</em></div>
              <div className={s.permRow}><Ic.eyeOff /><span>Copiar e imprimir</span><em className={s.permNo}>Bloqueado</em></div>
              <div className={s.permRow}><Ic.contacts /><span>Atender a los clientes</span><em className={s.permYes}>Permitido</em></div>
            </div>
          </div>
        </div>
      </section>

      {/* Fórmulas */}
      <section id="formulas" className={s.section}>
        <div className={`${s.wrap} ${s.split} ${s.splitRev}`}>
          <div>
            <span className={s.kicker}>Fórmulas de color</span>
            <h2 className={s.h2}>Iguala colores sin adivinar</h2>
            <p className={s.sub}>Busca el color y el tamaño que vas a preparar: la fórmula sale en mililitros, lista para el mostrador.</p>
            <Bullets items={['Cantidades en mL para 1 L, 4 L o 19 L', 'Búsqueda por nombre o código', 'Disponible según los catálogos de tu tienda']} />
          </div>
          <div className={`${s.mock} ${s.mockFormula}`} aria-hidden="true">
            <div className={s.formulaHead}>
              <span className={s.swatch} />
              <div><small>Fórmula · cubeta 19 L</small><strong>Arena del desierto</strong></div>
            </div>
            <ul className={s.formulaList}>
              <li><b style={{ background: '#C99A2E' }} />Óxido amarillo<span>38 mL</span></li>
              <li><b style={{ background: '#A8432B' }} />Óxido rojo<span>9 mL</span></li>
              <li><b style={{ background: '#2B2B2B' }} />Negro<span>4 mL</span></li>
            </ul>
            <div className={s.sizes}><span>1 L</span><span>4 L</span><span className={s.sizeOn}>19 L</span></div>
          </div>
        </div>
      </section>

      {/* Avisos */}
      <section id="avisos" className={`${s.section} ${s.sectionAlt}`}>
        <div className={`${s.wrap} ${s.split}`}>
          <div>
            <span className={s.kicker}>Avisos en tu celular</span>
            <h2 className={s.h2}>Te avisa a la hora, aunque la app esté cerrada</h2>
            <p className={s.sub}>Instálala como app en tu celular y recibe tus recordatorios y el resumen del día.</p>
            <Bullets items={['Recordatorios a la hora exacta', 'Resumen de pendientes cada mañana', 'Funciona en Android y en iPhone (agregada a la pantalla de inicio)']} />
          </div>
          <div className={s.phone} aria-hidden="true">
            <div className={s.phoneNotch} />
            <div className={s.notif}><span className={s.notifIcon}><Ic.bell /></span><div><strong>{APP_NAME} · ahora</strong><span>Llamar a Karen López para confirmar su cotización</span></div></div>
            <div className={s.notif}><span className={s.notifIcon}><Ic.calendar /></span><div><strong>{APP_NAME} · 8:00</strong><span>Hoy tienes 3 pendientes y 1 visita</span></div></div>
          </div>
        </div>
      </section>

      <CtaBand title="¿Lo quieres en tu tienda?" />
    </>
  )
}
