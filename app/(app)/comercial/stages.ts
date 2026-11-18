/**
 * Avance de la cartera: las cajas de arriba de Cartera (y su skeleton de carga).
 * Sin React: lo usan la vista y los skeletons que se muestran antes de cargarla.
 */
export type Stage = 'nuevo' | 'contactado' | 'cotizacion' | 'cliente' | 'no_contesta' | 'depurar' | 'sin_fecha'

export const STAGES: [Stage, string, string][] = [
  ['nuevo', 'Prospectos', 'var(--c-cyan-ink)'],
  ['contactado', 'Contactados', 'var(--c-teal-ink)'],
  ['cotizacion', 'En cotización', 'var(--warning-fill)'],
  ['cliente', 'Clientes', 'var(--success)'],
  ['no_contesta', 'No contesta', 'var(--danger)'],
]
