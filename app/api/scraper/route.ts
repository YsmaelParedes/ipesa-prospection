import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const maxDuration = 50

let activeScrapes = 0
const MAX_CONCURRENT = 2

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const INEGI_API_KEY = process.env.INEGI_API_KEY

// ── Estado INEGI codes ────────────────────────────────────────────────────────
// Mapeo del nombre de estado (Google geocoding) → clave INEGI de 2 dígitos
const STATE_CODES: Record<string, string> = {
  aguascalientes:        '01',
  'baja california':     '02',
  'baja california sur': '03',
  campeche:              '04',
  coahuila:              '05',
  colima:                '06',
  chiapas:               '07',
  chihuahua:             '08',
  'ciudad de mexico':    '09',
  'ciudad de méxico':    '09',
  'mexico city':         '09',
  'cdmx':                '09',
  durango:               '10',
  guanajuato:            '11',
  guerrero:              '12',
  hidalgo:               '13',
  jalisco:               '14',
  mexico:                '15',  // Estado de México (no país)
  'estado de mexico':    '15',
  'estado de méxico':    '15',
  michoacan:             '16',
  michoacán:             '16',
  morelos:               '17',
  nayarit:               '18',
  'nuevo leon':          '19',
  'nuevo león':          '19',
  oaxaca:                '20',
  puebla:                '21',
  queretaro:             '22',
  querétaro:             '22',
  'quintana roo':        '23',
  'san luis potosi':     '24',
  'san luis potosí':     '24',
  sinaloa:               '25',
  sonora:                '26',
  tabasco:               '27',
  tamaulipas:            '28',
  tlaxcala:              '29',
  veracruz:              '30',
  yucatan:               '31',
  yucatán:               '31',
  zacatecas:             '32',
}

function getStateCode(addressComponents: any[]): string | null {
  const state = addressComponents?.find(c => c.types.includes('administrative_area_level_1'))
  if (!state) return null
  const name = state.long_name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .replace(/\s+de\s+(zaragoza|ocampo|ignacio de la llave)/g, '')  // "Coahuila de Zaragoza" → "Coahuila"
    .trim()

  // Búsqueda exacta primero
  if (STATE_CODES[name]) return STATE_CODES[name]
  // Luego parcial
  for (const [key, code] of Object.entries(STATE_CODES)) {
    if (name.includes(key) || key.includes(name)) return code
  }
  return null
}

// ── Haversine distance (metros) ──────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, p = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lng2 - lng1) * p / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// ── Segmento IPESA ────────────────────────────────────────────────────────────
function mapSegmento(actividad: string): string {
  const a = actividad.toLowerCase()
  if (a.includes('ferret') || a.includes('materi') || a.includes('construc') || a.includes('plomer') || a.includes('electric') || a.includes('pintur')) return 'construccion'
  if (a.includes('tienda') || a.includes('minori') || a.includes('super') || a.includes('abarrot') || a.includes('comercio al por menor')) return 'retail'
  if (a.includes('industri') || a.includes('fabric') || a.includes('manufactur') || a.includes('mayoreo') || a.includes('al por mayor')) return 'industrial'
  if (a.includes('auto') || a.includes('taller') || a.includes('vehic') || a.includes('refacci')) return 'automotriz'
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
      const stateCode = getStateCode(r.address_components)
      return { lat: loc.lat, lng: loc.lng, ciudad: r.formatted_address, stateCode }
    }
  } catch {}
  return null
}

// ── Expansión de términos SCIAN ───────────────────────────────────────────────
function expandQueryTerms(query: string): string[] {
  const q = query.toLowerCase().trim()
  const terms = new Set<string>([q])

  const synonyms: Record<string, string[]> = {
    pintores:      ['pintura', 'pintor'],
    plomeros:      ['plomeria', 'plomería'],
    electricistas: ['electricidad', 'instalaciones electricas'],
    herreros:      ['herrería', 'herreria'],
    carpinteros:   ['carpintería', 'carpinteria'],
    albaniles:     ['construccion'],
    mecanicos:     ['taller mecanico', 'mecanica'],
    soldadores:    ['soldadura'],
    torneros:      ['torneria'],
    vidrieros:     ['vidrieria'],
    tapiceros:     ['tapiceria'],
    fontaneros:    ['plomeria'],
    contadores:    ['contabilidad'],
    abogados:      ['juridico', 'notaria'],
    medicos:       ['consultorio', 'clinica'],
  }

  if (synonyms[q]) synonyms[q].forEach(t => terms.add(t))

  if (q.endsWith('ores')) { terms.add(q.slice(0, -4) + 'ura'); terms.add(q.slice(0, -2)) }
  if (q.endsWith('eros')) { terms.add(q.slice(0, -4) + 'eria'); terms.add(q.slice(0, -2)) }
  if (q.endsWith('istas')) { terms.add(q.slice(0, -5)) }
  if (q.endsWith('es') && q.length > 4) { terms.add(q.slice(0, -2)) }
  if (q.endsWith('s') && q.length > 3 && !q.endsWith('es') && !q.endsWith('as')) {
    terms.add(q.slice(0, -1))
  }

  return Array.from(terms)
}

// ── INEGI BuscarEntidad con paginación ────────────────────────────────────────
// Supera el límite duro de 50 del endpoint "Buscar" (coordenadas).
// Devuelve TODOS los negocios del estado que coincidan, incluye lat/lng.
// Se filtran por distancia haversine en código.
async function searchINEGIByState(
  term: string,
  stateCode: string,
  lat: number,
  lng: number,
  radiusM: number,
  maxPages = 4
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

      // Filtrar por distancia inmediatamente para no acumular datos irrelevantes
      for (const item of data) {
        if (item.Latitud && item.Longitud) {
          const d = haversine(lat, lng, parseFloat(item.Latitud), parseFloat(item.Longitud))
          if (d <= radiusM) results.push(item)
        }
      }

      if (data.length < PAGE_SIZE) break  // última página
    } catch {
      break
    }
  }

  return results
}

// Fallback: endpoint original Buscar (coordenadas) si no tenemos código de estado
async function searchINEGIByCoords(term: string, lat: number, lng: number, radius: number): Promise<any[]> {
  const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/${encodeURIComponent(term)}/${lat},${lng}/${radius}/${INEGI_API_KEY}`
  try {
    const { data } = await axios.get(url, {
      headers: { Accept: 'application/json' },
      timeout: 15000,
      validateStatus: () => true,
    })
    if (!Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
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

        if (data.error) {
          return NextResponse.json({ error: data.error.message }, { status: 400 })
        }

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
          const phone = place.nationalPhoneNumber || ''
          const wa = formatWhatsApp(phone)
          const actividad = place.primaryTypeDisplayName?.text || ''
          const address = place.formattedAddress || ''
          const cpMatch = address.match(/\b(\d{5})\b/)
          const postal_code = cpMatch ? cpMatch[1] : inputCp
          return {
            name: place.displayName?.text || '',
            phone, whatsapp: wa,
            whatsapp_link: wa ? `https://wa.me/${wa}` : null,
            address, postal_code,
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

      if (stateCode) {
        // Modo óptimo: BuscarEntidad por estado + filtro haversine
        // Supera el límite duro de 50 del endpoint Buscar.
        // Puebla "bienes raices": 685 en estado → 50 en 5km (real count)
        // CDMX "bienes raices": >1000 en estado → 273 en 5km (vs 50 del modo antiguo)
        for (const term of terms) {
          const batch = await searchINEGIByState(term, stateCode, coords.lat, coords.lng, RADIUS)
          allBatches.push(batch)
          // Sin pausa entre términos: son peticiones diferentes a INEGI, no hay throttle
        }
      } else {
        // Fallback si no se pudo resolver el estado (raro)
        for (let i = 0; i < terms.length; i++) {
          const batch = await searchINEGIByCoords(terms[i], coords.lat, coords.lng, RADIUS)
          allBatches.push(batch)
          if (i < terms.length - 1) await new Promise(r => setTimeout(r, 300))
        }
      }

      // Deduplicar por ID INEGI o (nombre + CP)
      const seen = new Set<string>()
      const allItems: any[] = []
      for (const batch of allBatches) {
        for (const item of batch) {
          const key = item.Id ? String(item.Id) : `${item.Nombre}|${item.CP}`
          if (!seen.has(key)) {
            seen.add(key)
            allItems.push(item)
          }
        }
      }

      if (allItems.length === 0) {
        return NextResponse.json({
          source: 'inegi',
          ciudad: coords.ciudad,
          data: [],
          hint: `Sin resultados para "${query}". Intenta con: ${terms.slice(1).join(', ') || 'ninguna variante encontrada'}`,
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

    return NextResponse.json({ error: 'Fuente no válida' }, { status: 400 })

  } catch (error: any) {
    const msg = error?.response?.data?.error_message || error.message
    console.error('Scraper error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    activeScrapes--
  }
}
