/**
 * PDF de una cotización (solo servidor, con @react-pdf/renderer). Dibuja lo
 * mismo que components/QuoteSheet.tsx (la vista previa y la página del
 * cliente): si cambias el diseño de uno, cambia el otro.
 */
import path from 'node:path'
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { APP_NAME } from './brand'
import {
  computeTotals, fmtLongDate, fmtMoney, fmtQty, folioLabel, isFilled, lineTotal, storeAddressLines,
  type QuoteDoc, type QuoteStore,
} from './quotes'

const FONT_DIR = path.join(process.cwd(), 'node_modules', '@fontsource', 'manrope', 'files')
let fontsReady = false
function registerFonts() {
  if (fontsReady) return
  Font.register({
    family: 'Manrope',
    fonts: [400, 600, 700].map(w => ({ src: path.join(FONT_DIR, `manrope-latin-${w}-normal.woff`), fontWeight: w })),
  })
  // Sin guiones a mitad de palabra (las reglas por defecto son para inglés)
  Font.registerHyphenationCallback(word => [word])
  fontsReady = true
}

const C = { ink: '#131313', ink2: '#2D2D2C', muted: '#6B6B6A', faint: '#8F8F8E', line: '#E4E4E7', band: '#F3F4F6' }

const st = StyleSheet.create({
  page: { fontFamily: 'Manrope', fontSize: 9.5, color: C.ink2, paddingTop: 0, paddingBottom: 56, paddingHorizontal: 44, lineHeight: 1.45 },
  top: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: -44, height: 64, marginBottom: 26 },
  topLeft: { flex: 1, justifyContent: 'center', paddingLeft: 44 },
  logo: { maxHeight: 40, maxWidth: 150, objectFit: 'contain', objectPosition: 'left' },
  topBand: { width: '42%', backgroundColor: C.band, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 44 },
  title: { fontSize: 15, fontWeight: 600, color: C.ink },
  draft: { fontSize: 8, color: C.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  parties: { flexDirection: 'row', marginBottom: 22 },
  storeCol: { flex: 1, paddingRight: 18 },
  clientCol: { width: '42%', borderLeftWidth: 1, borderLeftColor: C.line, paddingLeft: 18 },
  storeName: { fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6, lineHeight: 1.25 },
  label: { fontSize: 11, color: C.faint, marginBottom: 6 },
  clientName: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 2 },
  line: { color: C.ink2 },
  meta: { marginBottom: 22 },
  metaRow: { flexDirection: 'row', marginBottom: 1 },
  metaKey: { fontWeight: 700, color: C.ink, marginRight: 4 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 8 },
  thText: { fontWeight: 700, color: C.ink, fontSize: 9 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 9, alignItems: 'center' },
  cDesc: { flex: 1, paddingLeft: 8, paddingRight: 10 },
  cQty: { width: 76 },
  cPrice: { width: 92, textAlign: 'right' },
  cSub: { width: 92, textAlign: 'right', paddingRight: 8 },
  totals: { alignSelf: 'flex-end', width: '44%', marginTop: 26 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  tTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8, marginTop: 3 },
  tTotalText: { fontSize: 13, fontWeight: 700, color: C.ink },
  notes: { marginTop: 30, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  notesTitle: { fontWeight: 700, color: C.ink, marginBottom: 3 },
  notesText: { color: C.muted },
  foot: { position: 'absolute', bottom: 24, left: 44, right: 44, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: C.faint },
})

type Logo = { data: Buffer; format: 'png' | 'jpg' }

/** El logo como PNG o JPG (el PDF no admite WebP: entonces va solo el nombre). */
async function loadLogo(url: string | null, origin: string): Promise<Logo | null> {
  if (!url) return null
  try {
    const r = await fetch(url.startsWith('/') ? `${origin}${url}` : url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return null
    const data = Buffer.from(await r.arrayBuffer())
    if (data.length > 3 * 1024 * 1024) return null
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return { data, format: 'png' }
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { data, format: 'jpg' }
    return null
  } catch {
    return null
  }
}

function QuotePdf({ doc, store, logo }: { doc: QuoteDoc; store: QuoteStore; logo: Logo | null }) {
  const items = doc.items.filter(isFilled)
  const t = computeTotals(items, doc.discount_kind, doc.discount_value, doc.tax_rate)
  const contact = [store.email, store.phone].filter(Boolean) as string[]
  const discountLabel = doc.discount_kind === 'percent' && doc.discount_value > 0 ? `Descuento (${fmtQty(doc.discount_value)} %)` : 'Descuento'
  return (
    <Document title={`Cotización ${folioLabel(doc.folio)} · ${store.name}`} author={store.name} creator={APP_NAME} producer={APP_NAME} language="es-MX">
      <Page size="LETTER" style={st.page}>
        <View style={st.top}>
          <View style={st.topLeft}>
            {/* Sin logo queda vacío: el nombre ya va abajo, con los datos de la tienda */}
            {logo ? <Image src={logo} style={st.logo} /> : null}
          </View>
          <View style={st.topBand}>
            <Text style={st.title}>Cotización</Text>
            {doc.status === 'draft' && <Text style={st.draft}>Borrador</Text>}
          </View>
        </View>

        <View style={st.parties}>
          <View style={st.storeCol}>
            <Text style={st.storeName}>{store.name}</Text>
            {store.legalName ? <Text style={st.line}>{store.legalName}</Text> : null}
            {store.rfc ? <Text style={st.line}>RFC: {store.rfc}</Text> : null}
            {storeAddressLines(store).map(l => <Text key={l} style={st.line}>{l}</Text>)}
            {contact.map(l => <Text key={l} style={st.line}>{l}</Text>)}
          </View>
          <View style={st.clientCol}>
            <Text style={st.label}>Cliente</Text>
            <Text style={st.clientName}>{doc.client_name || '—'}</Text>
            {doc.client_phone ? <Text style={st.line}>{doc.client_phone}</Text> : null}
            {doc.client_email ? <Text style={st.line}>{doc.client_email}</Text> : null}
          </View>
        </View>

        <View style={st.meta}>
          <View style={st.metaRow}><Text style={st.metaKey}>Cotización:</Text><Text>{folioLabel(doc.folio)}</Text></View>
          <View style={st.metaRow}><Text style={st.metaKey}>Fecha:</Text><Text>{fmtLongDate(doc.issued_on)}</Text></View>
          <View style={st.metaRow}><Text style={st.metaKey}>Válida hasta:</Text><Text>{fmtLongDate(doc.valid_until)}</Text></View>
          {doc.seller_name ? <View style={st.metaRow}><Text style={st.metaKey}>Atendió:</Text><Text>{doc.seller_name}</Text></View> : null}
        </View>

        <View style={st.th}>
          <Text style={[st.thText, st.cDesc]}>Producto</Text>
          <Text style={[st.thText, st.cQty]}>Cantidad</Text>
          <Text style={[st.thText, st.cPrice]}>Precio unitario</Text>
          <Text style={[st.thText, st.cSub]}>Subtotal</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={st.tr} wrap={false}>
            <Text style={st.cDesc}>{it.description || '—'}</Text>
            <Text style={st.cQty}>{fmtQty(it.quantity)}{it.unit ? ` ${it.unit}` : ''}</Text>
            <Text style={[st.cPrice, { color: C.muted }]}>{fmtMoney(it.price)}</Text>
            <Text style={st.cSub}>{fmtMoney(lineTotal(it))}</Text>
          </View>
        ))}

        <View style={st.totals} wrap={false}>
          <View style={st.tRow}><Text>Subtotal</Text><Text>{fmtMoney(t.subtotal)}</Text></View>
          <View style={st.tRow}><Text>{discountLabel}</Text><Text>{t.discount > 0 ? `-${fmtMoney(t.discount)}` : fmtMoney(0)}</Text></View>
          {doc.tax_rate > 0 && <View style={st.tRow}><Text>IVA {fmtQty(doc.tax_rate)} %</Text><Text>{fmtMoney(t.tax)}</Text></View>}
          <View style={st.tTotal}><Text style={st.tTotalText}>Total</Text><Text style={st.tTotalText}>{fmtMoney(t.total)}</Text></View>
          {doc.tax_rate === 0 && <Text style={{ fontSize: 8, color: C.faint, marginTop: 4, textAlign: 'right' }}>Precios sin IVA</Text>}
        </View>

        {doc.notes.trim() ? (
          <View style={st.notes} wrap={false}>
            <Text style={st.notesTitle}>Condiciones</Text>
            <Text style={st.notesText}>{doc.notes.trim()}</Text>
          </View>
        ) : null}

        <View style={st.foot} fixed>
          <Text>{store.branded ? `Hecha con ${APP_NAME} · matices.app` : ' '}</Text>
          <Text render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : '')} />
        </View>
      </Page>
    </Document>
  )
}

export async function renderQuotePdfBuffer(doc: QuoteDoc, store: QuoteStore, origin: string): Promise<Buffer> {
  registerFonts()
  const logo = await loadLogo(store.logoUrl, origin)
  return renderToBuffer(<QuotePdf doc={doc} store={store} logo={logo} />)
}
