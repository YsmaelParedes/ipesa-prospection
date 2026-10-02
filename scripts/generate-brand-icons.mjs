/**
 * Genera los íconos de la app a partir de public/brand-mark.svg (la gota de
 * pintura). Volver a correrlo si cambia la marca:
 *
 *   node scripts/generate-brand-icons.mjs
 *
 * Usa sharp, que ya instala Next.js. Si cambian los íconos, sube también la
 * versión de CACHE_NAME en public/sw.js: el service worker los sirve desde
 * su caché y si no, los celulares seguirían mostrando los anteriores.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'

const svg = readFileSync('public/brand-mark.svg')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

// Se renderiza al doble y se reduce para que los bordes salgan limpios
const mark = (px) =>
  sharp(svg, { density: Math.ceil((72 * px * 2) / 64) }).resize(px, px).png().toBuffer()

/** Gota centrada sobre blanco ocupando `scale` del lado; con 0.66 queda dentro de la zona segura de los íconos "maskable". */
async function onWhite(size, scale) {
  const px = Math.round(size * scale)
  const offset = Math.round((size - px) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: await mark(px), left: offset, top: offset }])
    .png()
    .toBuffer()
}

/** .ico con PNG embebidos (formato que aceptan todos los navegadores actuales). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map(i => i.png)])
}

writeFileSync('public/icon-512.png', await onWhite(512, 0.66))
writeFileSync('public/icon-192.png', await onWhite(192, 0.66))
writeFileSync('public/apple-touch-icon.png', await onWhite(180, 0.7))
const favicon = await Promise.all([16, 32, 48].map(async size => ({ size, png: await mark(size) })))
writeFileSync('app/favicon.ico', ico(favicon))

console.log('Íconos generados: public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png, app/favicon.ico')
