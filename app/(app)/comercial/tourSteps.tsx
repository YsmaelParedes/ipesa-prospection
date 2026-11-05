import { StatusChip } from '@/components/CommercialUI'
import type { TourStep } from './CommercialTour'
import s from './tour.module.css'

/** row: el cliente visible en la lista; ficha: además, su ficha abierta. */
export type CommercialStep = TourStep & { prepare?: 'row' | 'ficha' }

const at = (id: string) => `[data-tour="${id}"]`

/**
 * Pasos del recorrido (texto del mockup aprobado el 2 nov 2026). Se ajustan a
 * lo que ve cada quien: Oportunidades solo con equipo de ventas, Actividad
 * diaria y Acumulado solo administradores, registrar solo si puede escribir.
 */
export function commercialTour({ isAdmin, salesTeam, reports, readonly, waModule, clientId }: {
  isAdmin: boolean; salesTeam: boolean; reports: boolean; readonly: boolean; waModule: boolean
  /** Cliente que se usa de ejemplo (el primero de la lista); sin él, esos pasos salen al centro. */
  clientId?: string
}): CommercialStep[] {
  const team = salesTeam && isAdmin
  const summary = reports && isAdmin
  const steps: (CommercialStep | false)[] = [
    {
      id: 'welcome', title: 'Así funciona el Sistema Comercial',
      body: (
        <>
          <p>Aquí trabajas a tus clientes paso a paso. Cada uno avanza por etapas:</p>
          <div className={s.stages}>
            <StatusChip value="nuevo" /><em>→</em><StatusChip value="contactado" /><em>→</em>
            <StatusChip value="cotizacion" /><em>→</em><StatusChip value="cliente" />
          </div>
          <p>Tu día es sencillo: <b>llamas o escribes, registras cómo te fue y el sistema te dice cuándo volver.</b> Te enseñamos dónde está cada cosa en 2 minutos.</p>
        </>
      ),
    },
    {
      id: 'tabs', target: at('tabs'), title: 'Las pestañas',
      body: (
        <ul>
          <li><b>Hoy:</b> tu lista de trabajo del día.</li>
          <li><b>Cartera:</b> toda tu base, por etapa.</li>
          {salesTeam && <li><b>Oportunidades:</b> las cotizaciones abiertas.</li>}
          {team && <li><b>{summary ? 'Actividad diaria y Acumulado' : 'Actividad diaria'}:</b> cómo va el equipo (solo administradores).</li>}
        </ul>
      ),
    },
    {
      id: 'strip', target: at('strip'), title: 'Tu meta del día',
      body: (
        <>
          <p>Lo que llevas hoy contra tu meta:</p>
          <ul>
            <li><b>Llamadas</b> que hiciste.</li>
            <li><b>Efectivos:</b> cuando sí hubo conversación.</li>
            <li><b>Cotizaciones</b> y <b>ventas</b> registradas.</li>
            <li><b>Seguimientos:</b> contactos a clientes que ya habías trabajado.</li>
          </ul>
          <p>Toca cualquier número para ver con quién fue.</p>
        </>
      ),
    },
    {
      id: 'subs', target: at('subs'), title: 'En qué orden trabajar',
      body: (
        <ol>
          <li><b>Pendientes:</b> los vencidos (en rojo) y los de hoy. Son clientes a los que quedaste de volver: empieza por aquí.</li>
          <li><b>Nuevos:</b> prospectos sin dueño para completar tu meta.</li>
          <li><b>Para visita:</b> negocios sin teléfono; se trabajan en persona.</li>
        </ol>
      ),
    },
    {
      id: 'filters', target: at('filters'), title: 'Filtra y busca',
      body: (
        <>
          <p>Elige una <b>zona</b> o un <b>segmento</b> para enfocarte en un tipo de cliente.</p>
          <p>El buscador busca en <b>toda la base</b>{salesTeam ? ', también clientes de otros vendedores' : ''} o que te tocan otro día, y te dice cuándo.</p>
        </>
      ),
    },
    {
      id: 'row', prepare: 'row', target: clientId ? `[data-tour-row="${clientId}"]` : undefined, title: 'Cada renglón es un cliente',
      body: (
        <>
          <p>Ves su nombre, su etapa y cuándo te toca. Tócalo para abrir su ficha.</p>
          {!readonly && (
            <p>Los botones rápidos: <b>Llamar</b> abre tu teléfono{waModule ? <> y <b>WhatsApp</b> abre la app</> : ''}. También abren su ficha, lista para que registres al terminar.</p>
          )}
        </>
      ),
    },
    !readonly && {
      id: 'form', prepare: 'ficha', target: at('form'), title: 'Registra en 3 toques',
      body: (
        <>
          <ol>
            <li><b>Tipo:</b> llamada, WhatsApp o visita.</li>
            <li><b>Resultado:</b> cómo te fue.</li>
            <li><b>Nota y fecha:</b> te sugerimos cuándo volver; puedes cambiarla.</li>
          </ol>
          <p>Toca <b>Guardar</b> y listo. El cliente sale de tu lista hasta su próxima fecha.</p>
        </>
      ),
    },
    !readonly && {
      id: 'results', prepare: 'ficha', target: at('results'), title: 'Qué pasa con cada resultado',
      body: (
        <table className={s.table}>
          <tbody>
            <tr><td>Sin contacto</td><td>Vuelve mañana. Si no contesta 3 veces seguidas, baja al final de la lista.</td></tr>
            <tr><td>Contactado</td><td>Pasa a Contactado. Vuelve en 3 días.</td></tr>
            <tr><td>Cotización</td><td>Anotas el monto. Pasa a Cotización{salesTeam ? ' y a Oportunidades' : ''}. Vuelve en 2 días.</td></tr>
            <tr><td>Venta</td><td>Anotas el monto. Pasa a Cliente. Te recordamos ofrecer recompra en 30 días.</td></tr>
            <tr><td>No interesado</td><td>Sale de tu lista. Vuelve en 90 días.</td></tr>
            <tr><td>Núm. incorrecto</td><td>Sale de la lista para corregir el número.</td></tr>
          </tbody>
        </table>
      ),
    },
    {
      id: 'owner', prepare: 'ficha', target: at('ficha-head'), title: salesTeam ? 'El cliente es de quien lo trabaja' : 'La ficha del cliente',
      body: (
        <>
          {salesTeam && <p>Al registrar una llamada, WhatsApp o visita, el cliente <b>pasa a ser tuyo</b>, y la venta o cotización cuenta para ti.</p>}
          <p>Ahí ves su <b>próximo seguimiento</b>. Si ya no hace falta, toca <b>Cerrar seguimiento</b>. Abajo está todo su historial.</p>
        </>
      ),
    },
    {
      id: 'cartera', target: at('tab-cartera'), title: 'Cartera: toda tu base',
      body: <p>Todos tus contactos ordenados por etapa: prospectos, contactados, en cotización, clientes y los que no contestan. Filtra por zona y segmento.</p>,
    },
    salesTeam && {
      id: 'opp', target: at('tab-oportunidades'), title: 'Oportunidades: tus cotizaciones',
      body: (
        <>
          <p>Las cotizaciones abiertas, la más vieja primero. Cuando el cliente responda, márcala:</p>
          <ul>
            <li><b>Ganada:</b> registra la venta.</li>
            <li><b>Perdida:</b> no le interesó.</li>
            <li><b>Seguimiento:</b> anota cualquier otro avance.</li>
          </ul>
        </>
      ),
    },
    team && {
      id: 'activity', target: at('tab-actividad'), title: 'Actividad diaria',
      body: (
        <>
          <p>Cómo va <b>hoy</b> cada vendedor contra su meta, más lo cotizado y vendido hoy.</p>
          <p>Con <b>Editar metas</b> cambias las metas de la tienda o las de una persona.</p>
        </>
      ),
    },
    summary && {
      id: 'summary', target: at('tab-acumulado'), title: 'Acumulado',
      body: <p>Los totales de un <b>día, semana o mes</b>, comparados con el periodo anterior, con el avance contra la meta y una tabla por vendedor. Usa las flechas para ver periodos pasados.</p>,
    },
    {
      id: 'agenda', target: at('nav-agenda'), title: 'Todo queda en tu Agenda',
      body: (
        <>
          <p>Cada fecha que dejas al registrar aparece en tu <b>Agenda</b> ese día, junto con tus recordatorios. Si tienes los avisos activados, a las 8:00 te llega el resumen del día.</p>
          <p>Para repetir este recorrido, toca <b>¿Cómo funciona?</b></p>
        </>
      ),
    },
  ]
  return steps.filter((x): x is CommercialStep => !!x)
}
