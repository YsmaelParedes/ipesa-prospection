/**
 * Plan de numeración del IFT: qué números son de teléfono fijo y cuáles de
 * celular. Los contactos sin verificar con número fijo quedan «Fijo» y no
 * entran a las campañas (en México un número solo se porta de fijo a fijo o
 * de celular a celular; la evidencia de WhatsApp siempre gana).
 *
 * Uso (a mano, cada 3 meses):
 *   npm run ift:plan                       descarga el plan del portal del IFT
 *   npm run ift:plan -- ruta/al/plan.zip   o usa uno ya descargado (.zip o .csv)
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_KEY de .env.local y llama a
 * replace_ift_numbering, que reemplaza el plan completo y clasifica los
 * contactos sin verificar de todas las tiendas.
 *
 * El archivo (formato desde julio de 2025): ZONA, NUMERACION_INICIAL,
 * NUMERACION_FINAL, OCUPACION, MODALIDAD (CPP o MPP = celular, FIJO = fijo),
 * RAZON_SOCIAL, FECHA_ASIGNACION.
 */
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const PAGE = 'https://sns.ift.org.mx/sns-frontend/planes-numeracion/descarga-publica.xhtml'

/** El botón «Descargar» de la página pública es un formulario: hay que mandar su ViewState con la misma sesión. */
async function download() {
  const first = await fetch(PAGE)
  if (!first.ok) throw new Error(`El portal del IFT respondió ${first.status}`)
  const cookie = (first.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
  const html = await first.text()
  const viewState = /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/.exec(html)?.[1]
  if (!viewState) throw new Error('No se encontró el formulario de descarga en el portal del IFT')
  const res = await fetch(PAGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ FORM_planes: 'FORM_planes', 'FORM_planes:BTN_planPublico1': '', 'javax.faces.ViewState': viewState }),
  })
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('zip')) throw new Error('El portal del IFT no entregó el archivo del plan')
  console.log(`Descargado: ${/filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'plan'}`)
  return Buffer.from(await res.arrayBuffer())
}

/** El .csv dentro del .zip (el IFT lo entrega con un solo archivo). */
function unzipCsv(zip) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('El archivo no es un .zip válido')
  let p = zip.readUInt32LE(eocd + 16)
  for (let i = zip.readUInt16LE(eocd + 10); i > 0; i--) {
    const method = zip.readUInt16LE(p + 10), size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28), extraLen = zip.readUInt16LE(p + 30), commentLen = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    const name = zip.toString('latin1', p + 46, p + 46 + nameLen)
    if (name.toLowerCase().endsWith('.csv')) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + size)
      return method === 8 ? inflateRawSync(data) : data
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error('El .zip no trae el .csv del plan')
}

/** Rangos [inicio, fin, 'f' | 'm'], ordenados y con los vecinos del mismo tipo juntos. */
function planRanges(csv) {
  const rows = []
  for (const line of csv.split(/\r?\n/)) {
    const m = /^\d+,(\d{10}),(\d{10}),\d+,(CPP|MPP|FIJO),/.exec(line)
    if (m) rows.push([Number(m[1]), Number(m[2]), m[3] === 'FIJO' ? 'f' : 'm'])
  }
  rows.sort((a, b) => a[0] - b[0])
  const out = []
  for (const r of rows) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) throw new Error(`Rangos encimados en el plan: ${last[0]}-${last[1]} y ${r[0]}-${r[1]}`)
    if (last && last[2] === r[2] && r[0] === last[1] + 1) last[1] = r[1]
    else out.push([...r])
  }
  return { blocks: rows.length, ranges: out }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_KEY (corre con: npm run ift:plan)')
  const file = process.argv[2]
  const raw = file ? readFileSync(file) : await download()
  const csv = (raw[0] === 0x50 && raw[1] === 0x4b ? unzipCsv(raw) : raw).toString('latin1')
  const { blocks, ranges } = planRanges(csv)
  const fixed = ranges.filter(r => r[2] === 'f').length
  console.log(`${blocks.toLocaleString('es-MX')} bloques del IFT → ${ranges.length.toLocaleString('es-MX')} rangos (${fixed.toLocaleString('es-MX')} fijos)`)
  if (blocks < 100_000) throw new Error('El plan trae muy pocos bloques; no se cargó nada')

  const res = await fetch(`${url}/rest/v1/rpc/replace_ift_numbering`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_ranges: ranges }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`La base no aceptó el plan: ${body.message ?? res.status}`)
  console.log(`Listo: ${body.rangos} rangos cargados; ${body.contactos_fijos} contactos sin verificar quedaron como «Fijo».`)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })
