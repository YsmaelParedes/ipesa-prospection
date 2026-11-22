require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  computeTotals, parseItems, parseQuoteSettings, validateQuoteSettings, displayStatus, fmtMoney, folioLabel,
  whatsappMessage, pdfFilename, isFilled, activityKindFor, addDaysIso, fmtLongDate, storeAddressLines, DEFAULT_TERMS,
} = require('../lib/quotes.ts')

test('totales: como en el PDF de ejemplo (2 cubetas a $1,336.03 + IVA 16 %)', () => {
  assert.deepEqual(computeTotals([{ quantity: 2, price: 1336.03 }], 'percent', 0, 16),
    { subtotal: 2672.06, discount: 0, tax: 427.53, total: 3099.59 })
})

test('totales: descuento en % o en pesos, nunca mayor que el subtotal', () => {
  const items = [{ quantity: 2, price: 1336.03 }, { quantity: 1, price: 899.5 }, { quantity: 3, price: 145 }]
  assert.deepEqual(computeTotals(items, 'percent', 5, 16), { subtotal: 4006.56, discount: 200.33, tax: 609, total: 4415.23 })
  assert.deepEqual(computeTotals(items, 'amount', 6.56, 0), { subtotal: 4006.56, discount: 6.56, tax: 0, total: 4000 })
  assert.equal(computeTotals(items, 'amount', 99999, 16).total, 0)
  assert.equal(computeTotals(items, 'percent', 150, 16).total, 0)
  assert.equal(computeTotals(items, 'percent', 0, 8).tax, 320.52)
})

test('totales: sin errores de redondeo de punto flotante', () => {
  assert.equal(computeTotals([{ quantity: 3, price: 0.1 }], 'percent', 0, 0).total, 0.3)
  // 1.5 × 33.33 = 49.995 → $50.00 (medio centavo hacia arriba), + IVA $8.00
  assert.equal(computeTotals([{ quantity: 1.5, price: 33.33 }], 'percent', 0, 16).total, 58)
  assert.equal(computeTotals([{ quantity: 0.333, price: 10.05 }], 'percent', 0, 0).total, 3.35)
  assert.equal(computeTotals([{ quantity: 1.005, price: 100 }], 'percent', 0, 0).total, 100.5)
})

test('renglones: limpia y redondea; rechaza lo inválido', () => {
  const ok = parseItems([{ description: 'Vinílica', quantity: '2', unit: ' cubeta ', price: '1336.034' }, { description: '', quantity: 0, price: 0 }])
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.items[0], { description: 'Vinílica', quantity: 2, unit: 'cubeta', price: 1336.03 })
  assert.equal(isFilled(ok.items[1]), false)
  assert.equal(parseItems({}).ok, false)
  assert.equal(parseItems([{ description: 'x', quantity: -1, price: 1 }]).ok, false)
  assert.equal(parseItems([{ description: 'x', quantity: 1, price: 'abc' }]).ok, false)
  assert.equal(parseItems(Array.from({ length: 101 }, () => ({}))).ok, false)
})

test('renglones del catálogo: conservan el producto y si su precio es de la principal', () => {
  const id = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE'
  const { items } = parseItems([
    { description: 'Vinílica', quantity: 1, unit: 'galón', price: 716.38, product_id: id, fallback: true },
    { description: 'Mano de obra', quantity: 1, unit: 'servicio', price: 2500, product_id: 'no-es-un-id', fallback: true },
    { description: 'Rodillo', quantity: 2, unit: 'pza', price: 74.14, product_id: id, fallback: 'sí' },
  ])
  assert.deepEqual(items[0], { description: 'Vinílica', quantity: 1, unit: 'galón', price: 716.38, product_id: id.toLowerCase(), fallback: true })
  assert.deepEqual(items[1], { description: 'Mano de obra', quantity: 1, unit: 'servicio', price: 2500 })
  assert.equal(items[2].fallback, undefined)
})

test('ajustes: valores por defecto y validación', () => {
  assert.deepEqual(parseQuoteSettings(null), { validDays: 15, terms: DEFAULT_TERMS, taxDefault: true, taxRate: 16, rfc: '', legalName: '' })
  assert.equal(parseQuoteSettings({ validDays: 0, taxRate: 8 }).validDays, 15)
  assert.equal(parseQuoteSettings({ taxRate: 8 }).taxRate, 8)
  assert.equal(parseQuoteSettings({ terms: '' }).terms, '')
  const base = { validDays: 30, terms: 'Pago de contado', taxDefault: false, taxRate: 8, rfc: 'plp010101ab1', legalName: 'Pinturas SA' }
  assert.deepEqual(validateQuoteSettings(base), { ok: true, value: { ...base, rfc: 'PLP010101AB1' } })
  assert.equal(validateQuoteSettings({ ...base, rfc: 'NO-ES-RFC' }).ok, false)
  assert.equal(validateQuoteSettings({ ...base, taxRate: 10 }).ok, false)
  assert.equal(validateQuoteSettings({ ...base, validDays: 400 }).ok, false)
})

test('estado: una enviada pasa a Vencida después de su fecha', () => {
  assert.equal(displayStatus('sent', '2026-11-16', '2026-11-17'), 'expired')
  assert.equal(displayStatus('sent', '2026-11-17', '2026-11-17'), 'sent')
  assert.equal(displayStatus('accepted', '2026-01-01', '2026-11-17'), 'accepted')
  assert.equal(displayStatus('draft', '2026-01-01', '2026-11-17'), 'draft')
})

test('formatos: dinero, folio, fechas, archivo y mensaje de WhatsApp', () => {
  assert.equal(fmtMoney(3099.6), '$3,099.60')
  assert.equal(fmtMoney(0), '$0.00')
  assert.equal(folioLabel(31), '#31')
  assert.equal(folioLabel(0), 'Nueva')
  assert.equal(fmtLongDate('2025-09-18'), '18 de septiembre de 2025')
  assert.equal(addDaysIso('2026-11-17', 15), '2026-12-02')
  assert.equal(pdfFilename(31, 'IPESA Lomas de Angelópolis'), 'Cotizacion-31-IPESA-Lomas-de-Angelopolis.pdf')
  assert.equal(whatsappMessage({ folio: 31, client_name: 'Juan Pérez', total: 3099.6 }, 'IPESA', 'https://x/c/1'),
    'Hola Juan, te comparto la cotización #31 de IPESA por $3,099.60. Puedes verla y descargarla aquí: https://x/c/1')
  assert.deepEqual(storeAddressLines({ address: 'Hidalgo 31', city: 'Puebla', state: 'Puebla' }), ['Hidalgo 31', 'Puebla, México'])
  assert.deepEqual(storeAddressLines({ address: null, city: 'Cholula', state: 'Puebla' }), ['Cholula, Puebla, México'])
})

test('tipo de actividad en Comercial según cómo se envió', () => {
  assert.equal(activityKindFor('correo'), 'correo')
  assert.equal(activityKindFor('en_persona'), 'visita')
  assert.equal(activityKindFor(null), 'visita')
  for (const via of ['whatsapp', 'chat', 'compartir', 'enlace']) assert.equal(activityKindFor(via), 'whatsapp')
})

test('una cotización subida: «subida» en la app, «Cotización» para el cliente', () => {
  const { clientQuoteName } = require('../lib/quotes.ts')
  assert.equal(folioLabel(null), 'subida')
  assert.equal(clientQuoteName(31), 'Cotización #31')
  assert.equal(clientQuoteName(null), 'Cotización')
  assert.equal(whatsappMessage({ folio: null, client_name: 'Ana', total: 1500 }, 'Pinturas', 'https://x/c/2'),
    'Hola Ana, te comparto la cotización de Pinturas por $1,500.00. Puedes verla y descargarla aquí: https://x/c/2')
})

test('archivo de una cotización subida: PDF, JPG o PNG de hasta 10 MB', () => {
  const { quoteFileMime, quoteFileProblem, QUOTE_FILE_PATH, MAX_QUOTE_FILE } = require('../lib/quoteFiles.ts')
  assert.equal(quoteFileMime('Cotizacion.PDF', ''), 'application/pdf')
  assert.equal(quoteFileMime('foto.jpeg', ''), 'image/jpeg')
  assert.equal(quoteFileMime('x', 'image/png'), 'image/png')
  assert.equal(quoteFileMime('hoja.xlsx', ''), null)
  assert.equal(quoteFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 2048 }), null)
  assert.match(quoteFileProblem({ name: 'a.docx', type: '', size: 2048 }), /PDF o una foto/)
  assert.match(quoteFileProblem({ name: 'a.pdf', type: 'application/pdf', size: MAX_QUOTE_FILE + 1 }), /10 MB/)
  assert.match(quoteFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 }), /vacío/)
  const store = '11111111-1111-4111-8111-111111111111'
  assert.ok(QUOTE_FILE_PATH.test(`${store}/22222222-2222-4222-8222-222222222222.pdf`))
  assert.ok(!QUOTE_FILE_PATH.test(`${store}/../22222222-2222-4222-8222-222222222222.pdf`))
  assert.ok(!QUOTE_FILE_PATH.test(`${store}/22222222-2222-4222-8222-222222222222.exe`))
})
