/**
 * Modelos para empezar una plantilla: textos de ejemplo para tiendas de
 * pintura que ya cumplen las reglas de WhatsApp. Se copian al borrador y se
 * pueden cambiar todo. {{nombre}} es el nombre de cada cliente.
 */
import { BAJA_FOOTER, type TemplateCategory, type TemplateDraft } from '../../../lib/templateBuilder'

export type TemplateModel = { title: string; draft: Omit<TemplateDraft, 'name' | 'language'> }

const promo = (title: string, d: Partial<TemplateModel['draft']> & { body: string }): TemplateModel => ({
  title,
  draft: { category: 'MARKETING', header: { kind: 'none', text: '' }, examples: {}, footer: BAJA_FOOTER, buttons: [], ...d },
})
const notice = (title: string, d: Partial<TemplateModel['draft']> & { body: string }): TemplateModel => ({
  title,
  draft: { category: 'UTILITY', header: { kind: 'none', text: '' }, examples: {}, footer: '', buttons: [], ...d },
})

export const MODELS: Record<TemplateCategory, TemplateModel[]> = {
  MARKETING: [
    promo('Oferta por tiempo limitado', {
      header: { kind: 'image', text: '' },
      body: 'Hola {{nombre}}, solo hasta el {{fecha}} tienes {{descuento}} de descuento en {{producto}} en la tienda.\n\n¿Te cotizo lo que necesitas?',
      examples: { fecha: 'domingo 30', descuento: '15 %', producto: 'pintura vinílica' },
      buttons: [{ kind: 'reply', text: 'Quiero cotizar' }, { kind: 'reply', text: 'No me interesa' }],
    }),
    promo('Producto nuevo', {
      header: { kind: 'image', text: '' },
      body: 'Hola {{nombre}}, ya llegó {{producto}} a la tienda. Rinde más y seca rápido.\n\n¿Te apartamos uno?',
      examples: { producto: 'el esmalte de secado rápido' },
      buttons: [{ kind: 'reply', text: 'Sí, apártame uno' }],
    }),
    promo('Invitación a evento', {
      header: { kind: 'text', text: 'Te invitamos' },
      body: 'Hola {{nombre}}, te esperamos en {{evento}} el {{fecha}}. Habrá demostraciones y precios especiales.\n\n¿Vienes?',
      examples: { evento: 'nuestro día de pintores', fecha: 'sábado 28 a las 10 a. m.' },
      buttons: [{ kind: 'reply', text: 'Ahí estaré' }, { kind: 'reply', text: 'Esta vez no' }],
    }),
    promo('Cliente que no ha vuelto', {
      body: 'Hola {{nombre}}, hace tiempo que no te vemos por la tienda. Te guardamos {{beneficio}} en tu próxima compra.\n\n¿Te ayudamos con algo?',
      examples: { beneficio: '10 % de descuento' },
      buttons: [{ kind: 'reply', text: 'Quiero cotizar' }],
    }),
    promo('Temporada de lluvias', {
      header: { kind: 'image', text: '' },
      body: 'Hola {{nombre}}, llegó la temporada de impermeabilizar. Protege tu casa antes de las lluvias con nuestros impermeabilizantes de {{garantia}} de garantía.',
      examples: { garantia: '5 años' },
      buttons: [{ kind: 'call', text: 'Llamar a la tienda', phone: '' }],
    }),
    promo('Precios del mes', {
      body: 'Hola {{nombre}}, ya tenemos los precios de {{mes}}. Si quieres la lista completa o una cotización, respóndenos por aquí.',
      examples: { mes: 'diciembre' },
      buttons: [{ kind: 'reply', text: 'Mándame la lista' }],
    }),
  ],
  UTILITY: [
    notice('Pedido listo', {
      body: 'Hola {{nombre}}, tu pedido {{pedido}} ya está listo. Puedes recogerlo en la tienda en nuestro horario de siempre.',
      examples: { pedido: 'P-2041' },
      buttons: [{ kind: 'call', text: 'Llamar a la tienda', phone: '' }],
    }),
    notice('Cotización lista', {
      body: 'Hola {{nombre}}, ya está lista la cotización {{folio}} que nos pediste. Respóndenos si quieres hacer algún cambio.',
      examples: { folio: 'C-1024' },
      buttons: [{ kind: 'reply', text: 'Está bien' }, { kind: 'reply', text: 'Quiero cambios' }],
    }),
    notice('Pago recibido', {
      body: 'Hola {{nombre}}, recibimos tu pago de {{monto}}. Gracias por tu compra.',
      examples: { monto: '$1,250' },
    }),
    notice('Recordatorio de pago', {
      body: 'Hola {{nombre}}, te recordamos que tu pago de {{monto}} vence el {{fecha}}. Si ya lo hiciste, no hagas caso a este mensaje.',
      examples: { monto: '$3,480', fecha: '30 de noviembre' },
    }),
    notice('Visita a tu obra', {
      body: 'Hola {{nombre}}, te visitaremos el {{fecha}} para revisar tu obra. Si necesitas cambiar el día, respóndenos.',
      examples: { fecha: 'martes 2 a las 11 a. m.' },
      buttons: [{ kind: 'reply', text: 'Confirmo' }, { kind: 'reply', text: 'Cambiar día' }],
    }),
    notice('¿Cómo te atendimos?', {
      body: 'Hola {{nombre}}, gracias por tu compra. ¿Cómo te atendimos hoy?',
      buttons: [{ kind: 'reply', text: 'Muy bien' }, { kind: 'reply', text: 'Regular' }, { kind: 'reply', text: 'Mal' }],
    }),
  ],
}
