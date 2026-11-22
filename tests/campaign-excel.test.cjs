require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const XLSX = require('xlsx')
const { campaignsSheets } = require('../lib/exportData.ts')

// Excel de Resultados (Campañas de Mkt): un resumen por campaña y cada
// destinatario con su estado y el motivo si no le llegó.
const recipient = (fields) => ({
  phone: '2221234567', contactId: null, name: 'Ana', segment: 'Pintor', bucket: 'read',
  sentAt: '2026-11-20T16:00:00Z', updatedAt: '2026-11-20T16:05:00Z', kind: null, error: null,
  replied: false, previousFailures: 0, lastFailedAt: null, receivedLater: false, attempts: 1, ...fields,
})
const campaign = (template, recipients) => ({
  id: `${template}.1`, template, label: 'Pintor', startedAt: '2026-11-20T16:00:00Z', endedAt: '2026-11-20T16:10:00Z',
  total: recipients.length, read: recipients.filter(r => r.bucket === 'read').length, delivered: 0, pending: 0,
  failed: recipients.filter(r => r.bucket === 'failed').length, replied: recipients.filter(r => r.replied).length,
  recipients,
})

test('resumen y destinatarios de varias campañas', () => {
  const list = [
    campaign('promo_noviembre', [recipient({ replied: true }), recipient({ phone: '2229876543', name: null, bucket: 'failed', kind: 'no_whatsapp' })]),
    campaign('aviso_tienda', [recipient({ bucket: 'failed', kind: 'other', error: 'Error raro de Meta' })]),
  ]
  const [summary, people] = campaignsSheets(list)
  assert.equal(summary.name, 'Resumen')
  assert.deepEqual(summary.rows.map(r => [r['Campaña'], r['Destinatarios'], r['No entregados'], r['Respondieron']]),
    [['promo noviembre', 2, 1, 1], ['aviso tienda', 1, 1, 0]])
  assert.equal(people.name, 'Destinatarios')
  assert.equal(people.rows.length, 3)
  assert.deepEqual(people.rows.map(r => [r['Campaña'], r['Teléfono'], r['Estado'], r['Motivo'], r['Respondió']]), [
    ['promo noviembre', '222 123 4567', 'Leído', '', 'Sí'],
    ['promo noviembre', '222 987 6543', 'No entregado', 'Sin WhatsApp o sin aceptar los términos nuevos', 'No'],
    ['aviso tienda', '222 123 4567', 'No entregado', 'Error raro de Meta', 'No'],
  ])

  // El archivo se arma y se vuelve a leer igual (un texto que empieza con «=» sigue siendo texto)
  const wb = XLSX.utils.book_new()
  for (const sh of campaignsSheets([campaign('x', [recipient({ name: '=1+1' })])])) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sh.rows), sh.name)
  const back = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  assert.deepEqual(back.SheetNames, ['Resumen', 'Destinatarios'])
  const rows = XLSX.utils.sheet_to_json(back.Sheets.Destinatarios)
  assert.equal(rows[0]['Nombre'], '=1+1')
  assert.ok(!Object.values(back.Sheets.Destinatarios).some(c => c && typeof c === 'object' && c.f), 'no debe haber fórmulas')
})
