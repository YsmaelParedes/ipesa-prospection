require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseFilters, filtersQuery, resolveRange, rangeLabel, rangeSpan, activeFilterCount, bucketFor, bucketStart, bucketLabel,
  DEFAULT_FILTERS,
} = require('../lib/reports.ts')
const { performanceDayRows } = require('../lib/exportData.ts')

const UUID = '0b6f2c1e-1111-4a2b-9c3d-123456789abc'
const sp = q => new URLSearchParams(q)
const range = (period, today, extra = {}) => resolveRange({ ...DEFAULT_FILTERS, period, ...extra }, today)

test('Reportes: los filtros de la dirección se leen y se vuelven a escribir igual', () => {
  assert.deepEqual(parseFilters(sp('')), DEFAULT_FILTERS)
  const f = parseFilters(sp(`period=custom&from=2026-11-03&to=2026-11-21&compare=0&sellers=${UUID},nope&zone=Centro&segment=Pintores`))
  assert.deepEqual(f, { period: 'custom', from: '2026-11-03', to: '2026-11-21', compare: false, sellers: [UUID], zone: 'Centro', segment: 'Pintores' })
  assert.equal(filtersQuery(f), `period=custom&from=2026-11-03&to=2026-11-21&compare=0&sellers=${UUID}&zone=Centro&segment=Pintores`)
  // Lo que es el valor de siempre no va en la dirección
  assert.equal(filtersQuery(DEFAULT_FILTERS), '')
  // Lo que no se entiende se queda en su valor de siempre
  assert.deepEqual(parseFilters(sp('period=siglo&from=2026-02-30&to=ayer')), DEFAULT_FILTERS)
  assert.equal(activeFilterCount(f), 3)
})

test('Reportes: este mes va del 1 al día de hoy y se compara con los mismos días del pasado', () => {
  assert.deepEqual(range('month', '2026-11-22'),
    { from: '2026-11-01', to: '2026-11-30', end: '2026-11-22', prevFrom: '2026-10-01', prevEnd: '2026-10-22', partial: true })
  // Marzo 30 contra febrero: se topa en el último día de febrero
  assert.equal(range('month', '2026-03-30').prevEnd, '2026-02-28')
})

test('Reportes: hoy, la semana, el mes pasado y el año', () => {
  assert.deepEqual(range('today', '2026-11-22'),
    { from: '2026-11-22', to: '2026-11-22', end: '2026-11-22', prevFrom: '2026-11-21', prevEnd: '2026-11-21', partial: false })
  // 2026-11-19 es jueves: la semana empieza el lunes 16
  const week = range('week', '2026-11-19')
  assert.deepEqual([week.from, week.to, week.end, week.prevFrom, week.prevEnd], ['2026-11-16', '2026-11-22', '2026-11-19', '2026-11-09', '2026-11-12'])
  assert.deepEqual(range('last_month', '2026-11-22'),
    { from: '2026-10-01', to: '2026-10-31', end: '2026-10-31', prevFrom: '2026-09-01', prevEnd: '2026-09-30', partial: false })
  const year = range('year', '2026-11-22')
  assert.deepEqual([year.from, year.to, year.end, year.prevFrom, year.prevEnd], ['2026-01-01', '2026-12-31', '2026-11-22', '2025-01-01', '2025-11-22'])
})

test('Reportes: las fechas elegidas se comparan con los mismos días justo antes', () => {
  assert.deepEqual(range('custom', '2026-11-22', { from: '2026-11-10', to: '2026-11-16' }),
    { from: '2026-11-10', to: '2026-11-16', end: '2026-11-16', prevFrom: '2026-11-03', prevEnd: '2026-11-09', partial: false })
  // Un rango que llega al futuro se cuenta hasta hoy
  const open = range('custom', '2026-11-22', { from: '2026-11-20', to: '2026-11-30' })
  assert.deepEqual([open.end, open.prevFrom, open.prevEnd, open.partial], ['2026-11-22', '2026-11-17', '2026-11-19', true])
  // Al revés, en el futuro o de más de un año: no sirve
  assert.equal(range('custom', '2026-11-22', { from: '2026-11-16', to: '2026-11-10' }), null)
  assert.equal(range('custom', '2026-11-22', { from: '2026-12-01', to: '2026-12-05' }), null)
  assert.equal(range('custom', '2026-11-22', { from: '2025-01-01', to: '2026-11-01' }), null)
  assert.equal(range('custom', '2026-11-22', { from: '', to: '' }), null)
})

test('Reportes: cómo se nombra el periodo', () => {
  const today = '2026-11-22'
  assert.equal(rangeLabel('month', range('month', today), today), 'Este mes · 1 al 22 nov')
  assert.equal(rangeLabel('last_month', range('last_month', today), today), 'Mes pasado · octubre')
  assert.equal(rangeLabel('today', range('today', today), today), 'Hoy · 22 nov')
  assert.equal(rangeSpan({ from: '2026-10-28', end: '2026-11-03' }, today), '28 oct al 3 nov')
  assert.equal(rangeSpan({ from: '2025-12-28', end: '2026-01-03' }, today), '28 dic 2025 al 3 ene')
})

test('Reportes: las columnas van por día, semana o mes según lo largo del periodo', () => {
  assert.equal(bucketFor(22), 'day')
  assert.equal(bucketFor(62), 'day')
  assert.equal(bucketFor(120), 'week')
  assert.equal(bucketFor(326), 'month')
  assert.equal(bucketStart('2026-11-19', 'week'), '2026-11-16')
  assert.equal(bucketStart('2026-11-19', 'month'), '2026-11-01')
  assert.equal(bucketLabel('2026-11-16', 'week'), '16 nov')
  assert.equal(bucketLabel('2026-11-01', 'month'), 'nov')
  assert.equal(bucketLabel('2026-11-09', 'day'), '9')
})

test('Reportes: el Excel de Desempeño trae lo vendido cada día y acumulado', () => {
  const rows = performanceDayRows({
    series: { axis: ['2026-11-01', '2026-11-02', '2026-11-03'], sold: [100, 100, 350.5], prevSold: [50, 80, 90], activity: [] },
  })
  assert.deepEqual(rows.map(r => [r['Día'], r['Vendido ese día'], r['Vendido acumulado'], r['Periodo anterior acumulado']]),
    [['2026-11-01', 100, 100, 50], ['2026-11-02', 0, 100, 80], ['2026-11-03', 250.5, 350.5, 90]])
  // Los días que aún no llegan no salen
  assert.equal(performanceDayRows({ series: { axis: ['2026-11-01', '2026-11-02'], sold: [10, null], prevSold: [], activity: [] } }).length, 1)
})
