import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export const maxDuration = 60

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const INEGI_API_KEY = process.env.INEGI_API_KEY

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

async function geocodeCP(cp: string): Promise<{ lat: number; lng: number; ciudad: string } | null> {
  if (!GOOGLE_API_KEY) return null
  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: `${cp}, Mexico`, key: GOOGLE_API_KEY },
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
      timeout: 25000,
      validateStatus: () => true,
    })
    if (typeof data === 'string' || !Array.isArray(data)) return []
    return data
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    const { query, cp, source } = await req.json()

    if (!cp) {
      return NextResponse.json({ error: 'Se requiere código postal' }, { status: 400 })
    }

    const coords = await geocodeCP(cp)
    if (!coords) {
      return NextResponse.json({ error: `No se encontró el código postal ${cp}` }, { status: 400 })
    }

    // ── GOOGLE MAPS ──────────────────────────────────────────────────────────
    if (source === 'google_maps') {
      if (!GOOGLE_API_KEY) {
        return NextResponse.json({ error: 'Google Maps API key no configurada' }, { status: 500 })
      }

      const { data } = await axios.post(
        'https://places.googleapis.com/v1/places:searchText',
        {
          textQuery: `${query} código postal ${cp} México`,
          languageCode: 'es',
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: coords.lat, longitude: coords.lng },
              radius: 5000.0,
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName',
          },
          timeout: 20000,
        }
      )

      if (data.error) {
        return NextResponse.json({ error: data.error.message }, { status: 400 })
      }

      const results = (data.places || []).map((place: any) => {
        const phone = place.nationalPhoneNumber || ''
        const wa = formatWhatsApp(phone)
        const actividad = place.primaryTypeDisplayName?.text || ''
        return {
          name: place.displayName?.text || '',
          phone,
          whatsapp: wa,
          whatsapp_link: wa ? `https://wa.me/${wa}` : null,
          address: place.formattedAddress || '',
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

      const radius = 5000 // 5 km — radio óptimo (10km aborta el stream de INEGI)
      const terms = expandQueryTerms(query)

      // Buscar secuencialmente para no saturar la API de INEGI
      const searches: any[][] = []
      for (const t of terms) {
        const batch = await searchINEGI(t, coords.lat, coords.lng, radius)
        searches.push(batch)
        if (searches.flat().length >= 500) break // suficientes resultados
      }

      // Aplanar y deduplicar por ID INEGI o (nombre + CP)
      const seen = new Set<string>()
      const allItems: any[] = []
      for (const batch of searches) {
        for (const item of batch) {
          const key = item.Id || `${item.Nombre}|${item.CP}`
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
          hint: `Sin resultados en 10 km para "${query}". Intenta con términos como: ${terms.slice(1).join(', ') || 'ninguna variante encontrada'}`,
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
          segment: mapSegmento(actividad),
          activity: actividad,
          email: item.Correo_e || '',
          website: item.Sitio_internet || '',
        }
      })

      return NextResponse.json({ source: 'inegi', ciudad: coords.ciudad, data: results })
    }

    return NextResponse.json({ error: 'Fuente no válida' }, { status: 400 })

  } catch (error: any) {
    const msg = error?.response?.data?.error_message || error.message
    console.error('Scraper error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
