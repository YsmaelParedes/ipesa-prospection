import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

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

// Formatear número para WhatsApp (México +52)
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
      params: { address: `${cp}, Mexico`, key: GOOGLE_API_KEY }
    })
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location
      const ciudad = data.results[0].formatted_address
      return { lat: loc.lat, lng: loc.lng, ciudad }
    }
  } catch {}
  return null
}

export async function POST(req: NextRequest) {
  try {
    const { query, cp, source } = await req.json()

    if (!cp) {
      return NextResponse.json({ error: 'Se requiere código postal' }, { status: 400 })
    }

    // Geocodificar el CP para obtener coordenadas
    const coords = await geocodeCP(cp)
    if (!coords) {
      return NextResponse.json({ error: `No se encontró el código postal ${cp}` }, { status: 400 })
    }

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
              radius: 2000.0
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.primaryTypeDisplayName',
          },
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

    if (source === 'inegi') {
      if (!INEGI_API_KEY) {
        return NextResponse.json({ error: 'INEGI API key no configurada' }, { status: 500 })
      }

      const radius = 2000 // 2km alrededor del CP
      const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/${encodeURIComponent(query)}/${coords.lat},${coords.lng}/${radius}/${INEGI_API_KEY}`

      const { data } = await axios.get(url, {
        headers: { 'Accept': 'application/json' },
        validateStatus: () => true,
      })

      if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
        return NextResponse.json({ error: 'INEGI no devolvió resultados para ese CP.' }, { status: 400 })
      }

      const items = Array.isArray(data) ? data : []
      const results = items.map((item: any) => {
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
