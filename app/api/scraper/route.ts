import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const maxDuration = 50

// Límite de búsquedas concurrentes: si ya hay N en proceso, rechazar con 429
// Funciona en un proceso Node.js único (Railway, VPS). En serverless es no-op.
let activeScrapes = 0
const MAX_CONCURRENT = 2

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const INEGI_API_KEY = process.env.INEGI_API_KEY

// Términos de barrido amplio para maximizar cobertura por área.
// El DENUE devuelve TODOS los negocios que coincidan (sin límite de 50).
// Diferentes términos en el mismo centro NO activan el throttle de INEGI.
// Datos reales (3km, CDMX): taller=906, tienda=4027, servicio=8833
const AREA_SWEEP_TERMS = ['taller', 'tienda', 'construccion', 'ferreteria', 'servicio', 'distribuidor']

// Mapeo de actividad INEGI -> segmento IPESA
function mapSegmento(actividad: string): string {
  const a = actividad.toLowerCase()
  if (a.includes('ferret') || a.includes('materi') || a.includes('construc') || a.includes('plomer') || a.includes('electric') || a.includes('pintur')) return 'construccion'
  if (a.includes('tienda') || a.includes('minori') || a.includes('super') || a.includes('abarrot') || a.includes('comercio al por menor')) return 'retail'
  if (a.includes('industri') || a.includes('fabric') || a.includes('manufactur') || a.includes('mayoreo') || a.includes('al por mayor')) return 'industrial'
  if (a.includes('auto') || a.includes('taller') || a.includes('vehic') || a.includes('refacci')) return 'automotriz'
  if (a.includes('casa') || a.includes('hogar') || a.includes('residen') || a.includes('inmobil')) return 'residencial'
  return 'retail'
}

// Formatea número para WhatsApp (México +52)
function formatWhatsApp(phone: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  if (digits.length === 12 && digits.startsWith('52')) return digits
  if (digits.length > 6) return `52${digits.slice(-10)}`
  return null
}

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number; ciudad: string } | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: `${location}, Mexico`, key: GOOGLE_API_KEY },
      timeout: 10000,
    })
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location
      const ciudad = data.results[0].formatted_address
      return { lat: loc.lat, lng: loc.lng, ciudad }
    }
  } catch {}
  return null
}

/**
 * Genera variantes del query para mejorar cobertura en DENUE.
 * El DENUE indexa actividades con terminología SCIAN (ej: "pintura", no "pintores").
 */
function expandQueryTerms(query: string): string[] {
  const q = query.toLowerCase().trim()
  const terms = new Set<string>([q])

  // Mapa de sinónimos y formas SCIAN
  const synonyms: Record<string, string[]> = {
    pintores:    ['pintura', 'pintor'],
    plomeros:    ['plomeria', 'plomería', 'plomer'],
    electricistas: ['electricidad', 'instalaciones electricas', 'electrica'],
    herreros:    ['herrería', 'herreria', 'herrero'],
    carpinteros: ['carpintería', 'carpinteria'],
    albaniles:   ['construccion', 'albañil'],
    mecanicos:   ['taller mecanico', 'mecanica'],
    soldadores:  ['soldadura'],
    torneros:    ['torno', 'torneria'],
    vidrieros:   ['vidrieria', 'vidrio'],
    tapiceros:   ['tapiceria'],
    fontaneros:  ['plomeria'],
    contadores:  ['contabilidad', 'contador'],
    abogados:    ['juridico', 'notaria'],
    medicos:     ['medico', 'consultorio', 'clinica'],
  }

  if (synonyms[q]) synonyms[q].forEach(t => terms.add(t))

  // Normalización de plurales españoles
  if (q.endsWith('ores')) {
    terms.add(q.slice(0, -4) + 'ura')  // pintores → pintura
    terms.add(q.slice(0, -2))           // pintores → pintor
  }
  if (q.endsWith('eros')) {
    terms.add(q.slice(0, -4) + 'eria') // plomeros → plomeria
    terms.add(q.slice(0, -2))           // plomeros → plomer
  }
  if (q.endsWith('istas')) {
    terms.add(q.slice(0, -5))           // electricistas → electric
  }
  if (q.endsWith('es') && q.length > 4) {
    terms.add(q.slice(0, -2))           // talleres → taller
  }
  if (q.endsWith('s') && q.length > 3 && !q.endsWith('es') && !q.endsWith('as')) {
    terms.add(q.slice(0, -1))           // ferretería's → ferretería
  }

  return Array.from(terms)
}

async function searchINEGI(term: string, lat: number, lng: number, radius: number): Promise<any[]> {
  const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/${encodeURIComponent(term)}/${lat},${lng}/${radius}/${INEGI_API_KEY}`
  try {
    const { data } = await axios.get(url, {
      headers: { Accept: 'application/json' },
      timeout: 15000,
      validateStatus: () => true,
    })
    if (typeof data === 'string' || !Array.isArray(data)) return []
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
    const RADIUS = isCiudad ? 5000 : 3000

    // ── GOOGLE MAPS ──────────────────────────────────────────────────────────
    if (source === 'google_maps') {
      if (!GOOGLE_API_KEY) {
        return NextResponse.json({ error: 'Google Maps API key no configurada' }, { status: 500 })
      }

      const locationLabel = isCiudad ? location : `código postal ${location}`
      const inputCp = /^\d{5}$/.test(location.trim()) ? location.trim() : ''

      // Paginación: hasta 3 páginas × 20 resultados = máximo 60 por búsqueda
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
        // Google requiere 2s entre páginas para que el token sea válido
        await new Promise(r => setTimeout(r, 2000))
      }

      // Deduplicar por teléfono + nombre (Places no tiene ID único en esta versión)
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
            phone,
            whatsapp: wa,
            whatsapp_link: wa ? `https://wa.me/${wa}` : null,
            address,
            postal_code,
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

      // Estrategia de máximo alcance:
      // 1. Términos específicos del usuario (query + sinónimos)
      // 2. Términos de barrido amplio del área (diferentes términos, mismo centro)
      //
      // Clave: el DENUE NO limita resultados a 50 — devuelve TODOS los que coincidan.
      // Diferentes términos en el mismo punto NO activan el throttle de IP.
      // Resultado: potencialmente miles de negocios únicos por búsqueda.
      const userTerms = expandQueryTerms(query).slice(0, 2) // query + 1 sinónimo
      const sweepTerms = AREA_SWEEP_TERMS.filter(t => !userTerms.includes(t))
      const allTerms = [...userTerms, ...sweepTerms]
      // Total: ~8 términos × avg 500 resultados = ~4,000 negocios únicos

      const allBatches: any[][] = []
      for (let i = 0; i < allTerms.length; i++) {
        const batch = await searchINEGI(allTerms[i], coords.lat, coords.lng, RADIUS)
        allBatches.push(batch)
        if (i < allTerms.length - 1) {
          await new Promise(r => setTimeout(r, 200)) // 200ms entre términos distintos (seguro)
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
        const terms = expandQueryTerms(query)
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
          phone,
          whatsapp: wa,
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
