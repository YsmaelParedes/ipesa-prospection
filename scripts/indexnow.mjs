/**
 * IndexNow: avisa a Bing (y a los buscadores que lo usan: Yandex, Seznam,
 * Naver; Bing también alimenta a DuckDuckGo y a la búsqueda de ChatGPT) que
 * las páginas públicas cambiaron, para que las vuelvan a leer pronto.
 *
 * Uso, después de publicar cambios en el sitio público:
 *   npm run seo:indexnow
 *
 * Lee las direcciones del sitemap.xml publicado (así siempre coincide con
 * lib/site.ts). La llave es pública a propósito: el archivo
 * public/<llave>.txt demuestra que el sitio es nuestro.
 */

const SITE = (process.env.SITE_URL || 'https://www.matices.app').replace(/\/+$/, '')
const KEY = '1d7f50eafc9e0884a0fa3e27f50a7760'

const sitemap = await fetch(`${SITE}/sitemap.xml`)
if (!sitemap.ok) throw new Error(`No se pudo leer ${SITE}/sitemap.xml (${sitemap.status})`)
const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim())
if (!urls.length) throw new Error('El sitemap no tiene direcciones')

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
})

// 200/202: recibido. 403: la llave no coincide con el archivo publicado. 422: direcciones de otro dominio.
console.log(`IndexNow: ${res.status} ${res.statusText} · ${urls.length} direcciones enviadas`)
if (res.status >= 300) process.exitCode = 1
