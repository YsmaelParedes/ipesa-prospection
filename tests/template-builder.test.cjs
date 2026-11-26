require('./register-typescript.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  emptyDraft, slug, tokensOf, dataKeys, nextDataKey, normalizePhone, issuesOf, blockers, numberedBody, toComponents,
  draftAsDef, draftFromTemplate, parseDraft, suggestName, BAJA_FOOTER,
} = require('../lib/templateBuilder.ts')
const { toDef, metaError } = require('../lib/whatsappTemplatesServer.ts')
const { templateState, rejectionText } = require('../lib/whatsappTemplates.ts')
const { MODELS } = require('../app/(app)/plantillas/models.ts')

const draft = (patch = {}) => ({ ...emptyDraft('MARKETING'), name: 'buen_fin', ...patch })
const texts = issues => issues.map(i => i.text)

test('nombres y datos: sin acentos, en orden y sin repetir', () => {
  assert.equal(slug('  Buen Fin: ¡20 % en Vinílicas!  '), 'buen_fin_20_en_vinilicas')
  assert.equal(suggestName('Hola {{nombre}}, el Buen Fin ya llegó'), 'hola_el_buen_fin')
  assert.deepEqual(tokensOf('Hola {{nombre}}, del {{Fecha}} al {{fecha}} tienes {{ descuento }}'), ['nombre', 'fecha', 'descuento'])
  assert.deepEqual(dataKeys('Hola {{nombre}}, {{dato_1}} y {{dato_2}}'), ['dato_1', 'dato_2'])
  assert.equal(nextDataKey('Hola {{dato_1}} y {{dato_3}}'), 'dato_2')
  assert.equal(normalizePhone('222 555 0100'), '+522225550100')
  assert.equal(normalizePhone('+52 1 222 555 0100'), '+5212225550100')
})

test('un mensaje correcto no tiene nada que corregir', () => {
  const d = draft({ body: 'Hola {{nombre}}, del {{fecha}} tienes descuento en vinílicas. ¿Te cotizo?', examples: { fecha: '20 al 23 de noviembre' } })
  assert.deepEqual(blockers(issuesOf(d, { taken: new Set() })), [])
})

test('avisa lo que WhatsApp rechaza', () => {
  const t = d => texts(blockers(issuesOf(draft(d), { taken: new Set(['buen_fin|es_MX']) })))
  assert.ok(t({ body: 'Hola' }).some(x => x.includes('Ya tienes una plantilla con ese nombre')))
  assert.ok(t({ name: 'Buen Fin', body: 'Hola a todos' }).some(x => x.includes('minúsculas')))
  assert.ok(t({ name: 'otra', body: '{{nombre}}, ya llegó la promoción de la tienda' }).some(x => x.includes('no puede empezar')))
  assert.ok(t({ name: 'otra', body: 'Ya llegó la promoción de la tienda para {{nombre}}' }).some(x => x.includes('no puede terminar')))
  assert.ok(t({ name: 'otra', body: 'Hola {{nombre}} {{fecha}} ya llegó la promoción', examples: { fecha: 'x' } }).some(x => x.includes('no pueden ir juntos')))
  assert.ok(t({ name: 'otra', body: 'Hola {{nombre}}, tienes {{a}} en {{b}} hoy', examples: { a: '1', b: '2' } }).some(x => x.includes('muchos datos')))
  assert.ok(t({ name: 'otra', body: 'Hola {{nombre}}, ya llegó {{producto}} a la tienda nueva.' }).some(x => x.includes('Escribe un ejemplo para «producto»')))
  assert.ok(t({ name: 'otra', body: 'Hola {nombre}}, ya llegó la promoción de la tienda.' }).some(x => x.includes('mal escrito')))
  assert.ok(t({ name: 'otra', body: 'x'.repeat(1100) }).some(x => x.includes('1,024')))
  assert.ok(t({ name: 'otra', body: 'Hola, mensaje de la tienda.', header: { kind: 'text', text: '*Oferta*' } }).some(x => x.includes('formato')))
  assert.ok(t({ name: 'otra', body: 'Hola, mensaje de la tienda.', header: { kind: 'image', text: '' } }).some(x => x.includes('foto')))
  assert.ok(t({ name: 'otra', body: 'Hola, mensaje de la tienda.', buttons: [{ kind: 'url', text: 'Ver', url: 'tusitio' }] }).some(x => x.includes('dirección web')))
  assert.ok(t({ name: 'otra', body: 'Hola, mensaje de la tienda.', buttons: [{ kind: 'call', text: 'Llamar', phone: '123' }] }).some(x => x.includes('10 dígitos')))
  assert.ok(t({ name: 'otra', body: 'Hola, mensaje de la tienda.', buttons: [{ kind: 'reply', text: 'Sí' }, { kind: 'reply', text: 'sí' }] }).some(x => x.includes('Hay dos botones')))
  // Al corregir, el nombre propio no cuenta como ocupado
  assert.deepEqual(texts(blockers(issuesOf(draft({ body: 'Hola a todos los clientes de la tienda.' }), { taken: new Set(['buen_fin|es_MX']), editing: true }))), [])
})

test('consejos que no impiden enviarla', () => {
  const warns = issuesOf({ ...emptyDraft('UTILITY'), name: 'aviso', body: 'Hola, tienes 20 % de descuento esta semana en la tienda.' }).filter(i => i.warn)
  assert.ok(warns.some(w => w.text.includes('Parece una promoción')))
  const noBaja = issuesOf(draft({ name: 'x', footer: '', body: 'Hola, ya llegó lo nuevo a la tienda.' })).filter(i => i.warn)
  assert.ok(noBaja.some(w => w.text.includes('BAJA')))
})

test('lo que se manda a WhatsApp: nombre como {{1}}, ejemplos en orden y botones agrupados', () => {
  const d = draft({
    header: { kind: 'image', text: '' },
    body: 'Hola {{nombre}}, del {{fecha}} tienes {{descuento}} en vinílicas. ¿Vienes el {{fecha}}?',
    examples: { fecha: '20 al 23 de noviembre', descuento: '20 %' },
    footer: BAJA_FOOTER,
    buttons: [{ kind: 'url', text: 'Ver catálogo', url: 'https://ejemplo.com' }, { kind: 'reply', text: 'Quiero cotizar' }, { kind: 'call', text: 'Llamar', phone: '2225550100' }],
  })
  const { components, clientName } = toComponents(d, 'HANDLE')
  assert.equal(clientName, true)
  assert.deepEqual(components[0], { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['HANDLE'] } })
  assert.deepEqual(components[1], {
    type: 'BODY',
    text: 'Hola {{1}}, del {{2}} tienes {{3}} en vinílicas. ¿Vienes el {{2}}?',
    example: { body_text: [['María', '20 al 23 de noviembre', '20 %']] },
  })
  assert.deepEqual(components[2], { type: 'FOOTER', text: BAJA_FOOTER })
  assert.deepEqual(components[3].buttons.map(b => b.type), ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  assert.equal(components[3].buttons[2].phone_number, '+522225550100')
  // Sin el nombre del cliente, los datos empiezan en {{1}}
  assert.deepEqual(numberedBody({ body: 'Tu pedido {{pedido}} está listo, pasa por él.', examples: { pedido: 'P-1' } }), { text: 'Tu pedido {{1}} está listo, pasa por él.', examples: ['P-1'], clientName: false })
})

test('de ida y vuelta: corregir una plantilla de Meta recupera el borrador', () => {
  const meta = {
    id: '1', name: 'taller', language: 'es_MX', status: 'REJECTED', category: 'MARKETING', components: [
      { type: 'HEADER', format: 'TEXT', text: 'Te invitamos' },
      { type: 'BODY', text: 'Hola {{1}}, el taller es el {{2}} en la tienda.', example: { body_text: [['María', 'sábado 28']] } },
      { type: 'FOOTER', text: BAJA_FOOTER },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Ahí estaré' }, { type: 'PHONE_NUMBER', text: 'Llamar', phone_number: '+522225550100' }] },
    ],
  }
  const def = toDef(meta, true)
  assert.equal(def.clientName, true)
  assert.deepEqual(def.buttonList.map(b => b.kind), ['reply', 'call'])
  const d = draftFromTemplate(def)
  assert.equal(d.body, 'Hola {{nombre}}, el taller es el {{dato_1}} en la tienda.')
  assert.deepEqual(d.examples, { dato_1: 'sábado 28' })
  assert.deepEqual(d.header, { kind: 'text', text: 'Te invitamos' })
  assert.equal(d.buttons[1].phone, '+522225550100')
  // Y vuelve a dar la misma plantilla
  assert.equal(toComponents(d).components[1].text, 'Hola {{1}}, el taller es el {{2}} en la tienda.')
  // Hecha fuera de Matices: {{1}} no se toma como nombre
  assert.equal(draftFromTemplate(toDef(meta, false)).body, 'Hola {{dato_1}}, el taller es el {{dato_2}} en la tienda.')
  // La vista previa del borrador
  assert.equal(draftAsDef(d).bodyPreview, 'Hola {{1}}, el taller es el {{2}} en la tienda.')
})

test('lo que llega del navegador se revisa', () => {
  assert.equal(parseDraft(null), null)
  assert.equal(parseDraft({ ...draft(), category: 'AUTHENTICATION' }), null)
  assert.equal(parseDraft({ ...draft(), language: 'xx' }), null)
  assert.equal(parseDraft({ ...draft(), buttons: [{ kind: 'code', text: 'x' }] }), null)
  const ok = parseDraft({ ...draft({ body: 'Hola' }), examples: { fecha: 'x', 'mal clave': 'y' } })
  assert.deepEqual(ok.examples, { fecha: 'x' })
})

test('los 12 modelos cumplen las reglas de WhatsApp', () => {
  for (const [category, list] of Object.entries(MODELS)) {
    assert.equal(list.length, 6)
    for (const m of list) {
      const d = { ...m.draft, name: 'modelo', language: 'es_MX', buttons: m.draft.buttons.map(b => (b.kind === 'call' ? { ...b, phone: '2225550100' } : b)) }
      assert.equal(d.category, category)
      assert.deepEqual(texts(blockers(issuesOf(d, { hasImage: true }))), [], m.title)
    }
  }
})

test('estados y motivos en palabras de la tienda', () => {
  assert.equal(templateState('APPROVED'), 'ok')
  assert.equal(templateState('IN_APPEAL'), 'review')
  assert.equal(templateState('PAUSED'), 'paused')
  assert.equal(templateState('DISABLED'), 'off')
  assert.ok(rejectionText('INVALID_FORMAT').includes('formato'))
  assert.ok(metaError({ error: { code: 100, error_subcode: 2388023 } }, 'x').includes('Ya existe'))
  assert.equal(metaError({ error: { error_user_title: 'Título', error_user_msg: 'Detalle' } }, 'x'), 'Título: Detalle')
  assert.equal(metaError({}, 'Sin detalle'), 'Sin detalle')
})
