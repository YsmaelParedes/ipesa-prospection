import { ImageResponse } from 'next/og'
import { APP_NAME } from '@/lib/brand'
import { OG_SIZE } from '@/lib/site'

/**
 * Imagen que se ve al compartir cualquier enlace de Matices (WhatsApp, redes,
 * Google). Dirección fija (/og) para que todas las páginas la usen en sus
 * datos de compartir.
 *
 * WhatsApp muestra casi siempre un recorte chico del centro: la marca y el
 * nombre van grandes en medio, y las barras de pintura de las orillas solo
 * adornan cuando se ve completa.
 */
export const dynamic = 'force-static'

const INK = '#131313'
const RED = '#E50A26'
const SPECTRUM = 'linear-gradient(90deg, #E2E415 0%, #A2CF6B 16%, #4EC39C 33%, #00BBD9 50%, #E51585 75%, #FD0B2B 100%)'

/** Las cuatro barras de public/brand-mark.svg (lienzo de 64). */
const MARK = [
  { x: 6, y: 10, w: 40, c: '#E2E415' },
  { x: 14, y: 21, w: 44, c: '#00BBD9' },
  { x: 4, y: 32, w: 46, c: '#E51585' },
  { x: 16, y: 43, w: 42, c: '#FD0B2B' },
]

/** Barras grandes que salen de las orillas, como brochazos de la marca. */
const STROKES = [
  { left: -150, top: 70, w: 380, c: '#E2E415' },
  { left: -90, top: 158, w: 300, c: '#00BBD9' },
  { left: -170, top: 418, w: 360, c: '#E51585' },
  { left: -110, top: 506, w: 290, c: '#FD0B2B' },
  { left: 960, top: 70, w: 380, c: '#00BBD9' },
  { left: 1010, top: 158, w: 300, c: '#E51585' },
  { left: 980, top: 418, w: 360, c: '#FD0B2B' },
  { left: 1030, top: 506, w: 290, c: '#E2E415' },
]

/** Outfit, la letra de títulos del sitio. Si no se puede bajar, la imagen sale con la letra por defecto. */
async function outfit(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}`)).text()
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
    return url ? await (await fetch(url)).arrayBuffer() : null
  } catch {
    return null
  }
}

function Mark({ size }: { size: number }) {
  const u = size / 64
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
      {MARK.map(b => (
        <div key={b.c} style={{ position: 'absolute', left: b.x * u, top: b.y * u, width: b.w * u, height: 12 * u, borderRadius: 6 * u, background: b.c }} />
      ))}
    </div>
  )
}

export async function GET() {
  const [bold, semi] = await Promise.all([outfit(800), outfit(600)])
  const fonts = [
    ...(bold ? [{ name: 'Outfit', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(semi ? [{ name: 'Outfit', data: semi, weight: 600 as const, style: 'normal' as const }] : []),
  ]

  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden',
        fontFamily: fonts.length ? 'Outfit' : 'sans-serif', color: INK,
        background: 'radial-gradient(circle at 18% 12%, rgba(0, 187, 217, .16), transparent 46%), radial-gradient(circle at 84% 92%, rgba(229, 21, 133, .14), transparent 46%), #FFFFFF',
      }}>
        {STROKES.map(s => (
          <div key={`${s.left}-${s.top}`} style={{ position: 'absolute', left: s.left, top: s.top, width: s.w, height: 70, borderRadius: 35, background: s.c }} />
        ))}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 14, display: 'flex', background: SPECTRUM }} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Mark size={140} />
            <div style={{ marginLeft: 14, fontSize: 128, fontWeight: 800, letterSpacing: -4.5, lineHeight: 1 }}>{APP_NAME}</div>
          </div>
          <div style={{ display: 'flex', marginTop: 24, fontSize: 45, fontWeight: 800, letterSpacing: -1 }}>
            <span>El CRM para&nbsp;</span>
            <span style={{ backgroundImage: 'linear-gradient(90deg, #FD0B2B, #E51585 45%, #00A9C7 100%)', backgroundClip: 'text', color: 'transparent' }}>tiendas de pintura</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 40 }}>
            <div style={{ display: 'flex', padding: '16px 34px', borderRadius: 18, background: RED, color: '#FFFFFF', fontSize: 32, fontWeight: 800, boxShadow: '0 16px 34px -14px rgba(229, 10, 38, .9)' }}>
              Empieza gratis
            </div>
            <div style={{ display: 'flex', marginLeft: 26, fontSize: 30, fontWeight: 600, color: '#6B6B6A' }}>www.matices.app</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  )
}
