/**
 * Reportes (/reportes): periodos y filtros, y cómo viajan en la dirección.
 * Los usan la pantalla y el servidor, para que «Este mes» o «Mes pasado»
 * sean exactamente los mismos días en los dos lados.
 *
 * En la dirección: ?tab=equipo|desempeno|avance&period=month&from=&to=
 * &compare=0&sellers=id,id&zone=&segment=. Solo van los que no son el valor
 * de siempre, así que un enlace compartido abre el reporte tal cual.
 */
import { addDays, addMonths, periodRange, previousSameDays, startOfWeek } from './commercial'

export type ReportTab = 'equipo' | 'desempeno' | 'avance'
export const REPORT_TABS: ReportTab[] = ['equipo', 'desempeno', 'avance']

export type Preset = 'today' | 'week' | 'month' | 'last_month' | 'year' | 'custom'
export const PRESETS: Preset[] = ['today', 'week', 'month', 'last_month', 'year', 'custom']
export const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hoy', week: 'Esta semana', month: 'Este mes', last_month: 'Mes pasado', year: 'Este año', custom: 'Elegir fechas',
}

export type ReportFilters = {
  period: Preset
  /** Solo con period 'custom' (AAAA-MM-DD). */
  from: string
  to: string
  /** Comparar con el periodo anterior (de inicio, sí). */
  compare: boolean
  /** Vendedores elegidos (vacío: todos). El vendedor no lo usa: siempre ve lo suyo. */
  sellers: string[]
  zone: string
  segment: string
}

export const DEFAULT_FILTERS: ReportFilters = { period: 'month', from: '', to: '', compare: true, sellers: [], zone: '', segment: '' }

/** Lo más largo que puede ser un rango elegido a mano. */
export const MAX_CUSTOM_DAYS = 366
const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isIsoDate = (s: string) => ISO.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s

/** Lee los filtros de la dirección; lo que no se entiende se queda en su valor de siempre. */
export function parseFilters(sp: URLSearchParams): ReportFilters {
  const period = sp.get('period') as Preset | null
  const text = (k: string) => (sp.get(k) ?? '').trim().slice(0, 120)
  const sellers = [...new Set((sp.get('sellers') ?? '').split(',').map(x => x.trim()).filter(x => UUID.test(x)))].slice(0, 50)
  const from = text('from'), to = text('to')
  return {
    period: period && PRESETS.includes(period) ? period : DEFAULT_FILTERS.period,
    from: isIsoDate(from) ? from : '',
    to: isIsoDate(to) ? to : '',
    compare: sp.get('compare') !== '0',
    sellers,
    zone: text('zone'),
    segment: text('segment'),
  }
}

/** Los filtros como texto de dirección (sin los que están en su valor de siempre). */
export function filtersQuery(f: ReportFilters): string {
  const qs = new URLSearchParams()
  if (f.period !== DEFAULT_FILTERS.period) qs.set('period', f.period)
  if (f.period === 'custom') {
    if (f.from) qs.set('from', f.from)
    if (f.to) qs.set('to', f.to)
  }
  if (!f.compare) qs.set('compare', '0')
  if (f.sellers.length) qs.set('sellers', f.sellers.join(','))
  if (f.zone) qs.set('zone', f.zone)
  if (f.segment) qs.set('segment', f.segment)
  return qs.toString()
}

/** Cuántos filtros hay puestos además del periodo (el número del botón «Filtros» en el celular). */
export const activeFilterCount = (f: ReportFilters) => (f.sellers.length ? 1 : 0) + (f.zone ? 1 : 0) + (f.segment ? 1 : 0)

export type ReportRange = {
  from: string
  /** Último día del periodo completo (el mes termina el 30 aunque hoy sea 22). */
  to: string
  /** Hasta dónde se cuenta: hoy si el periodo sigue en curso. */
  end: string
  /** Con qué se compara: los mismos días del periodo anterior. */
  prevFrom: string
  prevEnd: string
  /** El periodo sigue en curso. */
  partial: boolean
}

const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/**
 * Los días que cubre un periodo y con cuáles se compara. Un periodo en curso
 * se compara con los mismos días del anterior (el 1–22 de este mes contra el
 * 1–22 del pasado); un rango elegido a mano, con los mismos días justo antes.
 * null si el rango elegido no sirve.
 */
export function resolveRange(f: Pick<ReportFilters, 'period' | 'from' | 'to'>, today: string): ReportRange | null {
  const done = (from: string, to: string, prev: { from: string; to: string }) => {
    const end = to > today ? today : to
    return { from, to, end, prevFrom: prev.from, prevEnd: prev.to, partial: end < to }
  }
  switch (f.period) {
    case 'today':
      return done(today, today, { from: addDays(today, -1), to: addDays(today, -1) })
    case 'week': {
      const from = startOfWeek(today)
      return done(from, addDays(from, 6), previousSameDays('week', from, today))
    }
    case 'month': {
      const { from, to } = periodRange('month', today, 0)
      return done(from, to, previousSameDays('month', from, today))
    }
    case 'last_month': {
      const { from, to } = periodRange('month', today, 1)
      return done(from, to, previousSameDays('month', from, to))
    }
    case 'year': {
      const y = today.slice(0, 4)
      const from = `${y}-01-01`
      // El año pasado hasta el mismo día (un 29 de febrero se topa en el 28)
      return done(from, `${y}-12-31`, { from: `${Number(y) - 1}-01-01`, to: addMonths(today, -12) })
    }
    case 'custom': {
      if (!isIsoDate(f.from) || !isIsoDate(f.to) || f.from > f.to || f.from > today) return null
      if (daysFrom(f.from, f.to) + 1 > MAX_CUSTOM_DAYS) return null
      const end = f.to > today ? today : f.to
      const prevEnd = addDays(f.from, -1)
      return done(f.from, f.to, { from: addDays(prevEnd, -daysFrom(f.from, end)), to: prevEnd })
    }
  }
}

/** Días naturales de un rango, ambos incluidos. */
export const rangeDays = (from: string, to: string) => daysFrom(from, to) + 1

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** "22 nov" (con año si no es el de hoy). */
export function shortDate(iso: string, today?: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MES[m - 1]}${today && iso.slice(0, 4) !== today.slice(0, 4) ? ` ${y}` : ''}`
}

/** "1 al 22 nov", "28 oct al 3 nov", "22 nov". */
export function rangeSpan(r: Pick<ReportRange, 'from' | 'end'>, today: string): string {
  return r.from === r.end ? shortDate(r.from, today)
    : r.from.slice(0, 7) === r.end.slice(0, 7) ? `${Number(r.from.slice(8))} al ${shortDate(r.end, today)}`
    : `${shortDate(r.from, today)} al ${shortDate(r.end, today)}`
}

/** "Este mes · 1 al 22 nov", "Mes pasado · octubre", "3 al 21 nov". */
export function rangeLabel(period: Preset, r: Pick<ReportRange, 'from' | 'end'>, today: string): string {
  const span = rangeSpan(r, today)
  if (period === 'custom') return span
  if (period === 'last_month') {
    const [y, m] = r.from.split('-').map(Number)
    return `Mes pasado · ${MESES[m - 1]}${String(y) !== today.slice(0, 4) ? ` ${y}` : ''}`
  }
  return `${PRESET_LABELS[period]} · ${span}`
}

/** Texto de la casilla de comparar. */
export const COMPARE_LABELS: Record<Preset, string> = {
  today: 'Comparar con ayer', week: 'Comparar con la semana pasada', month: 'Comparar con el mes pasado',
  last_month: 'Comparar con el mes anterior', year: 'Comparar con el año pasado', custom: 'Comparar con los días anteriores',
}

/** Cómo se llama el periodo y el anterior en la leyenda de las gráficas. */
export const SERIES_LABELS: Record<Preset, { now: string; prev: string; noun: string }> = {
  today: { now: 'Hoy', prev: 'Ayer', noun: 'el día' },
  week: { now: 'Esta semana', prev: 'Semana pasada', noun: 'la semana' },
  month: { now: 'Este mes', prev: 'Mes pasado', noun: 'el mes' },
  last_month: { now: 'Mes pasado', prev: 'Mes anterior', noun: 'el mes' },
  year: { now: 'Este año', prev: 'Año pasado', noun: 'el año' },
  custom: { now: 'Estos días', prev: 'Días anteriores', noun: 'el periodo' },
}

/** Cómo se agrupan las columnas de actividad: por día hasta 2 meses, luego por semana, luego por mes. */
export type Bucket = 'day' | 'week' | 'month'
export const bucketFor = (days: number): Bucket => days <= 62 ? 'day' : days <= 190 ? 'week' : 'month'
/** Inicio del grupo al que pertenece un día. */
export function bucketStart(day: string, bucket: Bucket): string {
  return bucket === 'day' ? day : bucket === 'week' ? startOfWeek(day) : `${day.slice(0, 7)}-01`
}
/** Etiqueta corta de un grupo: "3", "3 nov" o "nov". */
export function bucketLabel(start: string, bucket: Bucket): string {
  const [, m, d] = start.split('-').map(Number)
  return bucket === 'day' ? String(d) : bucket === 'week' ? `${d} ${MES[m - 1]}` : MES[m - 1]
}
