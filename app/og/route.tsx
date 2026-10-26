import { ImageResponse } from 'next/og'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'
import { OG_SIZE } from '@/lib/site'

/**
 * Imagen que se ve al compartir cualquier enlace de Matices (WhatsApp, redes,
 * Google): marca, lema y la franja de colores de la app. Dirección fija (/og)
 * para que todas las páginas la usen en sus datos de compartir.
 */
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F7F7F8', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', height: 22, background: 'linear-gradient(90deg, #E2E415 0%, #A2CF6B 16%, #4EC39C 33%, #00BBD9 50%, #E51585 75%, #FD0B2B 100%)' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: 76, height: 76, borderRadius: 20, overflow: 'hidden', marginRight: 24 }}>
              <div style={{ flex: 1, background: '#E2E415' }} />
              <div style={{ flex: 1, background: '#00BBD9' }} />
              <div style={{ flex: 1, background: '#E51585' }} />
              <div style={{ flex: 1, background: '#E50A26' }} />
            </div>
            <div style={{ fontSize: 76, fontWeight: 800, color: '#131313', letterSpacing: -2 }}>{APP_NAME}</div>
          </div>
          <div style={{ fontSize: 66, fontWeight: 800, color: '#131313', lineHeight: 1.1, letterSpacing: -1.5 }}>{APP_TAGLINE}</div>
          <div style={{ fontSize: 34, color: '#4A4A49', marginTop: 28 }}>Contactos, cotizaciones, agenda y equipo en un solo lugar.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 96px 44px', fontSize: 28, fontWeight: 700 }}>
          <div style={{ color: '#E50A26' }}>Empieza gratis</div>
          <div style={{ color: '#6B6B6A' }}>www.matices.app</div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
