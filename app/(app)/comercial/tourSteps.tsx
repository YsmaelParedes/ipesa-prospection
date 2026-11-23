import { StatusChip } from '@/components/CommercialUI'
import type { TourStep } from './CommercialTour'
import s from './tour.module.css'

/** row: el cliente visible en la lista; ficha: además, su ficha abierta. */
export type CommercialStep = TourStep & { prepare?: 'row' | 'ficha' }

const at = (id: string) => `[data-tour="${id}"]`

/**
 * Recorrido corto: 5 pasos generales (antes eran hasta 14 y se sentía largo).
 * Se ajusta a lo que ve cada quien: Actividad diaria y Acumulado solo
 * administradores con equipo; registrar solo si puede escribir.
 */
export function commercialTour({ isAdmin, salesTeam, reports, readonly, clientId }: {
  isAdmin: boolean; salesTeam: boolean; reports: boolean; readonly: boolean
  /** Cliente que se usa de ejemplo (el primero de la lista); sin él, ese paso sale al centro. */
  clientId?: string
}): CommercialStep[] {
  const team = salesTeam && isAdmin
  const summary = reports && isAdmin
  return [
    {
      id: 'welcome', title: 'Así funciona el Sistema Comercial',
      body: (
        <>
          <p>Aquí trabajas a tus clientes por etapas:</p>
          <div className={s.stages}>
            <StatusChip value="nuevo" /><em>→</em><StatusChip value="contactado" /><em>→</em>
            <StatusChip value="cotizacion" /><em>→</em><StatusChip value="cliente" />
          </div>
          <p>Tu día: <b>llamas o escribes, registras cómo te fue y el sistema te dice cuándo volver.</b></p>
        </>
      ),
    },
    {
      id: 'tabs', target: at('tabs'), title: 'Las pestañas',
      body: (
        <ul>
          <li><b>Hoy:</b> a quién contactar hoy. Empieza por Pendientes.</li>
          <li><b>Cartera:</b> toda tu base, por etapa.</li>
          <li><b>Oportunidades:</b> tus cotizaciones abiertas.</li>
          {team && <li><b>{summary ? 'Actividad diaria y Acumulado' : 'Actividad diaria'}:</b> cómo va el equipo.</li>}
        </ul>
      ),
    },
    {
      id: 'strip', target: at('strip'), title: 'Tu meta del día',
      body: <p>Lo que llevas hoy contra tu meta. Toca cualquier número para ver con quién fue.</p>,
    },
    readonly ? {
      id: 'row', prepare: 'row', target: clientId ? `[data-tour-row="${clientId}"]` : undefined, title: 'Cada renglón es un cliente',
      body: <p>Tócalo para ver su ficha y su historial.</p>,
    } : {
      id: 'form', prepare: 'ficha', target: at('form'), title: 'Registra cómo te fue',
      body: (
        <p>
          Toca un cliente para abrir su ficha, elige cómo lo contactaste y cómo te fue, y toca <b>Guardar</b>.
          El sistema te sugiere cuándo volver{salesTeam ? ' y el cliente pasa a ser tuyo' : ''}.
        </p>
      ),
    },
    {
      id: 'agenda', target: at('nav-agenda'), title: 'Todo queda en tu Agenda',
      body: <p>Las fechas que dejas al registrar aparecen en tu <b>Agenda</b>. Para repetir este recorrido, toca <b>¿Cómo funciona?</b></p>,
    },
  ]
}
