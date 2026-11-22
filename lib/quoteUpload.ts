/**
 * Subir el archivo de una cotización (solo navegador): va directo al
 * almacenamiento con una dirección que da el servidor, porque Vercel no deja
 * pasar más de 4.5 MB. Devuelve la ruta para crear la cotización después.
 */
import { apiFetch } from './apiClient'
import { quoteFileMime, quoteFileProblem } from './quoteFiles'

export async function uploadQuoteFile(file: File): Promise<string> {
  const problem = quoteFileProblem(file)
  const mime = quoteFileMime(file.name, file.type)
  if (problem || !mime) throw new Error(problem ?? 'Sube un PDF o una foto (JPG o PNG)')
  const r = await apiFetch('/api/data/quotes/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, type: mime, size: file.size }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'No se pudo subir el archivo')
  const put = await fetch(d.signedUrl as string, { method: 'PUT', headers: { 'Content-Type': mime, 'x-upsert': 'false' }, body: file })
  if (!put.ok) throw new Error('No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.')
  return d.path as string
}
