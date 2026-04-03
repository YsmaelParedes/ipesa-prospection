import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import * as cheerio from 'cheerio'

export const maxDuration = 50

let activeScrapes = 0
const MAX_CONCURRENT = 2

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const INEGI_API_KEY = process.env.INEGI_API_KEY

// ── Estado INEGI codes ────────────────────────────────────────────────────────
const STATE_CODES: Record<string, string> = {
  'aguascalientes':        '01',
  'baja california':       '02',
  'baja california sur':   '03',
  'campeche':              '04',
  'coahuila':              '05',
  'colima':                '06',
  'chiapas':               '07',
  'chihuahua':             '08',
  'ciudad de mexico':      '09',
  'ciudad de méxico':      '09',
  'mexico city':           '09',
  'cdmx':                  '09',
  'durango':               '10',
  'guanajuato':            '11',
  'guerrero':              '12',
  'hidalgo':               '13',
  'jalisco':               '14',
  'estado de mexico':      '15',
  'estado de méxico':      '15',
  'michoacan':             '16',
  'michoacán':             '16',
  'morelos':               '17',
  'nayarit':               '18',
  'nuevo leon':            '19',
  'nuevo león':            '19',
  'oaxaca':                '20',
  'puebla':                '21',
  'queretaro':             '22',
  'querétaro':             '22',
  'quintana roo':          '23',
  'san luis potosi':       '24',
  'san luis potosí':       '24',
  'sinaloa':               '25',
  'sonora':                '26',
  'tabasco':               '27',
  'tamaulipas':            '28',
  'tlaxcala':              '29',
  'veracruz':              '30',
  'yucatan':               '31',
  'yucatán':               '31',
  'zacatecas':             '32',
}

function getStateCode(addressComponents: any[]): string | null {
  const state = addressComponents?.find(c => c.types.includes('administrative_area_level_1'))
  if (!state) return null
  // Normalizar: minúsculas, sin acentos, quitar "de X" geopolítico
  const name = state.long_name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+de\s+(zaragoza|ocampo|ignacio de la llave)/g, '')
    .trim()
  if (STATE_CODES[name]) return STATE_CODES[name]
  // Búsqueda parcial como fallback
  for (const [key, code] of Object.entries(STATE_CODES)) {
    if (name.startsWith(key) || key.startsWith(name)) return code
  }
  return null
}

// ── Haversine (metros) ────────────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, p = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lng2 - lng1) * p / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ── Segmento IPESA ────────────────────────────────────────────────────────────
function mapSegmento(actividad: string): string {
  const a = actividad.toLowerCase()
  if (a.includes('ferret') || a.includes('materi') || a.includes('construc') || a.includes('plomer') || a.includes('electric') || a.includes('pintur') || a.includes('hidro') || a.includes('herrer') || a.includes('carpint')) return 'construccion'
  if (a.includes('tienda') || a.includes('minori') || a.includes('super') || a.includes('abarrot') || a.includes('comercio al por menor')) return 'retail'
  if (a.includes('industri') || a.includes('fabric') || a.includes('manufactur') || a.includes('mayoreo') || a.includes('al por mayor')) return 'industrial'
  if (a.includes('auto') || a.includes('taller') || a.includes('vehic') || a.includes('refacci') || a.includes('rectific')) return 'automotriz'
  if (a.includes('casa') || a.includes('hogar') || a.includes('residen') || a.includes('inmobil') || a.includes('bienes ra')) return 'residencial'
  return 'retail'
}

// ── Formato WhatsApp ──────────────────────────────────────────────────────────
function formatWhatsApp(phone: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  if (digits.length === 12 && digits.startsWith('52')) return digits
  if (digits.length > 6) return `52${digits.slice(-10)}`
  return null
}

// ── Geocoding ─────────────────────────────────────────────────────────────────
async function geocodeLocation(location: string): Promise<{
  lat: number; lng: number; ciudad: string; stateCode: string | null
} | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: `${location}, Mexico`, key: GOOGLE_API_KEY },
      timeout: 10000,
    })
    if (data.status === 'OK' && data.results.length > 0) {
      const r = data.results[0]
      const loc = r.geometry.location
      return {
        lat: loc.lat, lng: loc.lng,
        ciudad: r.formatted_address,
        stateCode: getStateCode(r.address_components),
      }
    }
  } catch {}
  return null
}

// ── Expansión de términos SCIAN ───────────────────────────────────────────────
function expandQueryTerms(query: string): string[] {
  const q = query.toLowerCase().trim()
  const terms = new Set<string>([q])

  const synonyms: Record<string, string[]> = {
    // Trabajadores → nombre de negocio (para BuscarEntidad) + SCIAN (para Buscar)
    // Pinturas / recubrimientos (giro principal IPESA)
    pintura:       ['pinturas', 'recubrimiento', 'recubrimientos', 'impermeabilizante'],
    pinturas:      ['recubrimiento', 'recubrimientos', 'impermeabilizante'],
    recubrimiento: ['pinturas', 'recubrimientos', 'impermeabilizante', 'pintura'],
    recubrimientos:['pinturas', 'recubrimiento', 'impermeabilizante'],
    impermeabilizante: ['impermeabilizantes', 'recubrimiento', 'pinturas'],
    ferreteria:    ['ferretería', 'materiales', 'construrama', 'pintureria'],
    ferretería:    ['ferreteria', 'materiales', 'construrama'],
    // Otros oficios
    plomero:       ['plomeria', 'plomería', 'hidraulica'],
    plomeros:      ['plomeria', 'plomería'],
    electricista:  ['electrica', 'electricidad'],
    electricistas: ['electrica', 'electricidad'],
    carpintero:    ['carpinteria', 'carpintería'],
    carpinteros:   ['carpinteria', 'carpintería'],
    albanil:       ['construccion', 'albanileria'],
    albaniles:     ['construccion'],
    pintor:        ['pintura', 'pinturas', 'recubrimientos'],
    pintores:      ['pintura', 'pinturas'],
    herrero:       ['herreria', 'herrería'],
    herreros:      ['herreria', 'herrería'],
    soldador:      ['soldadura'],
    soldadores:    ['soldadura'],
    tornero:       ['torneria'],
    vidrieros:     ['vidrieria', 'vidrio'],
    tapiceros:     ['tapiceria'],
    fontaneros:    ['plomeria'],
    mecanico:      ['taller mecanico', 'mecanica'],
    mecanicos:     ['taller mecanico', 'mecanica'],
    contador:      ['contabilidad'],
    contadores:    ['contabilidad'],
    abogado:       ['juridico', 'notaria'],
    abogados:      ['juridico'],
    medico:        ['consultorio', 'clinica'],
    medicos:       ['consultorio', 'clinica'],
  }

  if (synonyms[q]) synonyms[q].forEach(t => terms.add(t))

  // Plurales y variantes
  if (q.endsWith('ores')) { terms.add(q.slice(0, -4) + 'ura'); terms.add(q.slice(0, -2)) }
  if (q.endsWith('eros')) { terms.add(q.slice(0, -4) + 'eria'); terms.add(q.slice(0, -2)) }
  if (q.endsWith('istas')) { terms.add(q.slice(0, -5)) }
  if (q.endsWith('es') && q.length > 4) { terms.add(q.slice(0, -2)) }
  if (q.endsWith('s') && q.length > 3 && !q.endsWith('es') && !q.endsWith('as')) {
    terms.add(q.slice(0, -1))
  }

  return Array.from(terms)
}

// ── INEGI Buscar por coordenadas ──────────────────────────────────────────────
// Busca por NOMBRE + CLASE_ACTIVIDAD dentro del radio. Límite: ~50-100 por término.
// Correcto para búsquedas de oficio (herrería, plomería) que no siempre están en el nombre.
async function searchByCoords(term: string, lat: number, lng: number, radius: number): Promise<any[]> {
  const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/${encodeURIComponent(term)}/${lat},${lng}/${radius}/${INEGI_API_KEY}`
  try {
    const { data } = await axios.get(url, {
      headers: { Accept: 'application/json' },
      timeout: 12000,
      validateStatus: () => true,
    })
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ── INEGI BuscarEntidad por estado + filtro haversine ────────────────────────
// Busca por NOMBRE en todo el estado, filtra por distancia.
// Excelente para ciudades grandes donde hay más de 50 negocios del mismo tipo.
// Devuelve las coincidencias de nombre (complementa el Buscar de actividades).
async function searchByState(
  term: string,
  stateCode: string,
  lat: number,
  lng: number,
  radiusM: number,
  maxPages = 3
): Promise<any[]> {
  const PAGE_SIZE = 1000
  const results: any[] = []

  for (let page = 0; page < maxPages; page++) {
    const start = page * PAGE_SIZE + 1
    const end = (page + 1) * PAGE_SIZE
    const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/BuscarEntidad/${encodeURIComponent(term)}/${stateCode}/${start}/${end}/${INEGI_API_KEY}`
    try {
      const { data } = await axios.get(url, {
        headers: { Accept: 'application/json' },
        timeout: 12000,
        validateStatus: () => true,
      })
      if (!Array.isArray(data) || data.length === 0) break

      for (const item of data) {
        if (item.Latitud && item.Longitud) {
          const d = haversine(lat, lng, parseFloat(item.Latitud), parseFloat(item.Longitud))
          if (d <= radiusM) results.push(item)
        }
      }

      if (data.length < PAGE_SIZE) break
    } catch {
      break
    }
  }

  return results
}

// ── Sección Amarilla MX (seccionamarilla.com.mx) ──────────────────────────────
// Directorio de negocios Telmex — SSR, selectores Schema.org
// URL: /resultados/1/{query}/{state-city}/?pagina={n}
interface SAResult { results: any[]; debug: string }

async function searchSeccionAmarilla(query: string, location: string, maxPages = 3): Promise<SAResult> {
  const results: any[] = []
  const seen = new Set<string>()
  const debugLines: string[] = []

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9',
    'Referer': 'https://www.seccionamarilla.com.mx/',
  }

  // Slug: minúsculas, acentos removidos, espacios → guiones
  const slug = (s: string) =>
    s.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')

  const qSlug = slug(query)
  const lSlug = slug(location)

  // Probar URL base para diagnóstico
  const testUrl = `https://www.seccionamarilla.com.mx/resultados/1/${qSlug}/${lSlug}/`
  try {
    const resp = await axios.get(testUrl, { headers, timeout: 14000, validateStatus: () => true })
    const html = typeof resp.data === 'string' ? resp.data : ''
    debugLines.push(`status=${resp.status} len=${html.length}`)

    if (resp.status !== 200 || html.length < 1000) {
      debugLines.push('respuesta vacía o error HTTP')
      return { results: [], debug: debugLines.join(' | ') }
    }

    const isSPA = !html.includes('itemtype') && !html.includes('sa-name') && html.includes('<app-root')
    debugLines.push(`isSPA=${isSPA}`)

    const $p = cheerio.load(html)
    const sampleCounts = ['[itemtype*="LocalBusiness"]', '.sa-name', 'h2.listing-name', '.listing', '.resultado', 'article']
      .map(s => `${s}:${$p(s).length}`).join(' ')
    debugLines.push(`selectors: ${sampleCounts}`)
    const snippet = $p('body').html()?.slice(0, 600).replace(/\s+/g, ' ') || ''
    debugLines.push(`snippet: ${snippet}`)
  } catch (e: any) {
    debugLines.push(`probe error: ${e.message}`)
    return { results: [], debug: debugLines.join(' | ') }
  }

  // ── Parsear páginas ───────────────────────────────────────────────────────
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.seccionamarilla.com.mx/resultados/1/${qSlug}/${lSlug}/?pagina=${page}`
    try {
      const { data: html } = await axios.get(url, { headers, timeout: 15000 })
      if (typeof html !== 'string' || html.length < 500) break

      const $ = cheerio.load(html)

      // Sección Amarilla usa Schema.org LocalBusiness en sus listings
      const containers = $('[itemtype*="LocalBusiness"], .listing-item, .sa-card, .resultado-item, article.result')
      debugLines.push(`page=${page} found=${containers.length}`)
      if (containers.length === 0) break

      containers.each((_i, el) => {
        const $el = $(el)

        const name = (
          $el.find('[itemprop="name"]').first().text() ||
          $el.find('.sa-name, .listing-name, h2, h3').first().text()
        ).trim().replace(/\s+/g, ' ')

        if (!name || name.length < 2) return

        const phoneRaw = (
          $el.find('[itemprop="telephone"]').first().text() ||
          $el.find('a[href^="tel:"]').first().attr('href')?.replace('tel:', '') ||
          $el.find('.sa-phone, .phone, .telefono').first().text()
        )?.trim() || ''
        const phone = phoneRaw.replace(/\D/g, '').slice(-10)

        const address = (
          $el.find('[itemprop="streetAddress"]').first().text() ||
          $el.find('[itemprop="address"]').first().text() ||
          $el.find('.sa-address, .address, .direccion').first().text()
        ).trim().replace(/\s+/g, ' ')

        const activity = (
          $el.find('[itemprop="description"], .sa-category, .category').first().text()
        ).trim()

        const cpMatch = address.match(/\b(\d{5})\b/)
        const key = phone || name.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)

        const wa = formatWhatsApp(phone)
        results.push({
          name, phone, whatsapp: wa,
          whatsapp_link: wa ? `https://wa.me/${wa}` : null,
          address, postal_code: cpMatch ? cpMatch[1] : '',
          activity: activity || query, segment: mapSegmento(activity || query),
          email: '',
        })
      })

      const hasNext = $('a[rel="next"], .pagination .next, a.siguiente, .paginacion .siguiente').length > 0
      if (!hasNext) break
      if (page < maxPages) await new Promise(r => setTimeout(r, 1200))
    } catch {
      break
    }
  }

  return { results, debug: debugLines.join(' | ') }
}

// ── Deduplicar por ID INEGI ───────────────────────────────────────────────────
function dedupe(batches: any[][]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const batch of batches) {
    for (const item of batch) {
      const key = item.Id ? String(item.Id) : `${item.Nombre}|${item.CP}`
      if (!seen.has(key)) { seen.add(key); out.push(item) }
    }
  }
  return out
}

export async function POST(req: NextRequest) {
  if (activeScrapes >= MAX_CONCURRENT) {
    return NextResponse.json(
      { error: 'El servidor está procesando otra búsqueda. Intenta en unos segundos.' },
      { status: 429 }
    )
  }

  activeScrapes++
  try {
    const { query, location, locationType, source } = await req.json()

    if (!location) {
      return NextResponse.json({ error: 'Se requiere código postal o municipio' }, { status: 400 })
    }

    const coords = await geocodeLocation(location)
    if (!coords) {
      return NextResponse.json({ error: `No se encontró la ubicación "${location}"` }, { status: 400 })
    }

    const isCiudad = locationType === 'ciudad'
    const RADIUS = isCiudad ? 8000 : 5000

    // ── GOOGLE MAPS ──────────────────────────────────────────────────────────
    if (source === 'google_maps') {
      if (!GOOGLE_API_KEY) {
        return NextResponse.json({ error: 'Google Maps API key no configurada' }, { status: 500 })
      }

      const locationLabel = isCiudad ? location : `código postal ${location}`
      const inputCp = /^\d{5}$/.test(location.trim()) ? location.trim() : ''
      const allPlaces: any[] = []
      let pageToken: string | undefined

      for (let page = 0; page < 3; page++) {
        const body: any = {
          textQuery: `${query} ${locationLabel} México`,
          languageCode: 'es',
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: coords.lat, longitude: coords.lng },
              radius: isCiudad ? 8000.0 : 5000.0,
            },
          },
        }
        if (pageToken) body.pageToken = pageToken

        const { data } = await axios.post(
          'https://places.googleapis.com/v1/places:searchText',
          body,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': GOOGLE_API_KEY,
              'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName,nextPageToken',
            },
            timeout: 20000,
          }
        )

        if (data.error) return NextResponse.json({ error: data.error.message }, { status: 400 })
        allPlaces.push(...(data.places || []))
        pageToken = data.nextPageToken
        if (!pageToken) break
        await new Promise(r => setTimeout(r, 2000))
      }

      const seenG = new Set<string>()
      const results = allPlaces
        .filter(place => {
          const key = `${place.displayName?.text}|${place.nationalPhoneNumber}`
          if (seenG.has(key)) return false
          seenG.add(key)
          return true
        })
        .map((place: any) => {
          const rawPhone = place.nationalPhoneNumber || ''
          // Google devuelve "222 123 4567" — quedarnos solo con los 10 dígitos locales
          const phone = rawPhone.replace(/\D/g, '').slice(-10)
          const wa = formatWhatsApp(phone)
          const actividad = place.primaryTypeDisplayName?.text || ''
          const address = place.formattedAddress || ''
          const cpMatch = address.match(/\b(\d{5})\b/)
          return {
            name: place.displayName?.text || '',
            phone, whatsapp: wa,
            whatsapp_link: wa ? `https://wa.me/${wa}` : null,
            address, postal_code: cpMatch ? cpMatch[1] : inputCp,
            segment: mapSegmento(actividad),
            activity: actividad,
            rating: place.rating || null,
          }
        })

      return NextResponse.json({ source: 'google_maps', ciudad: coords.ciudad, data: results })
    }

    // ── INEGI DENUE ──────────────────────────────────────────────────────────
    if (source === 'inegi') {
      if (!INEGI_API_KEY) {
        return NextResponse.json({ error: 'INEGI API key no configurada' }, { status: 500 })
      }

      const terms = expandQueryTerms(query).slice(0, 3)
      const { stateCode } = coords
      const allBatches: any[][] = []

      // ── Por cada término: Buscar (coordenadas) + BuscarEntidad (estado) ────
      //
      // Buscar      → busca NOMBRE + CLASE_ACTIVIDAD dentro del radio.
      //               Correcto para oficios (electricista → "Instalaciones eléctricas")
      //               pero limitado a ~50-100 resultados.
      //
      // BuscarEntidad → busca solo NOMBRE en todo el estado, filtra por distancia.
      //               Captura negocios explícitamente nombrados con el término.
      //               Supera el límite de 50 en ciudades grandes.
      //
      // La unión de ambos da la cobertura máxima.

      for (let i = 0; i < terms.length; i++) {
        const term = terms[i]

        // Buscar por coordenadas (NOMBRE + ACTIVIDAD)
        const coordsResults = await searchByCoords(term, coords.lat, coords.lng, RADIUS)
        allBatches.push(coordsResults)

        // BuscarEntidad por estado (solo NOMBRE, paginated) — si tenemos estado
        if (stateCode) {
          const stateResults = await searchByState(term, stateCode, coords.lat, coords.lng, RADIUS)
          allBatches.push(stateResults)
        }

        // Pequeña pausa entre términos para no saturar INEGI
        if (i < terms.length - 1) await new Promise(r => setTimeout(r, 300))
      }

      const allItems = dedupe(allBatches)

      if (allItems.length === 0) {
        return NextResponse.json({
          source: 'inegi',
          ciudad: coords.ciudad,
          data: [],
          hint: `Sin resultados para "${query}". Intenta con: ${terms.slice(1).join(', ') || 'otro término'}`,
        })
      }

      const results = allItems.map((item: any) => {
        const phone = item.Telefono || ''
        const wa = formatWhatsApp(phone)
        const actividad = item.Clase_actividad || ''
        return {
          name: item.Nombre || '',
          phone, whatsapp: wa,
          whatsapp_link: wa ? `https://wa.me/${wa}` : null,
          address: [item.Calle, item.Num_Exterior, item.Colonia, `CP ${item.CP}`]
            .filter(Boolean).join(', '),
          postal_code: item.CP ? String(item.CP) : '',
          segment: mapSegmento(actividad),
          activity: actividad,
          email: item.Correo_e || '',
          website: item.Sitio_internet || '',
          inegi_id: item.Id ? String(item.Id) : null,
        }
      })

      return NextResponse.json({ source: 'inegi', ciudad: coords.ciudad, data: results })
    }

    // ── SECCIÓN AMARILLA ─────────────────────────────────────────────────────
    if (source === 'paginas_amarillas') {
      // Usar ciudad del geocoding si dieron CP numérico
      const searchLoc = /^\d{5}$/.test(location.trim())
        ? coords.ciudad.split(',')[0].trim()
        : location.trim()

      const { results: items, debug } = await searchSeccionAmarilla(query, searchLoc)
      console.log('[SA debug]', debug)

      if (items.length === 0) {
        return NextResponse.json({
          source: 'paginas_amarillas',
          ciudad: coords.ciudad,
          data: [],
          hint: `Sin resultados en Sección Amarilla para "${query}" en "${searchLoc}". Debug: ${debug}`,
        })
      }

      return NextResponse.json({ source: 'paginas_amarillas', ciudad: coords.ciudad, data: items })
    }

    return NextResponse.json({ error: 'Fuente no válida' }, { status: 400 })

  } catch (error: any) {
    const msg = error?.response?.data?.error_message || error.message
    console.error('Scraper error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    activeScrapes--
  }
}
