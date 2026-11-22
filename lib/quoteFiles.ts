/**
 * Cotizaciones subidas (cliente y servidor): el PDF o la foto de una
 * cotización hecha en otro sistema o a mano. El archivo va directo del
 * navegador al almacenamiento, porque Vercel no deja pasar más de 4.5 MB.
 */

export const QUOTE_FILES_BUCKET = 'quote-files'
export const MAX_QUOTE_FILE = 10 * 1024 * 1024
/** Para el selector de archivos del navegador (también la cámara del celular). */
export const QUOTE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

export const QUOTE_FILE_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const
export type QuoteFileMime = keyof typeof QUOTE_FILE_EXT

/** El tipo por lo que dice el navegador o, si no lo dice, por la extensión. */
export function quoteFileMime(name: string, type: string): QuoteFileMime | null {
  if (Object.hasOwn(QUOTE_FILE_EXT, type)) return type as QuoteFileMime
  const ext = name.toLowerCase().split('.').pop()
  return ext === 'pdf' ? 'application/pdf' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : null
}

export const isImageFile = (mime: string) => mime === 'image/jpeg' || mime === 'image/png'

/** «tienda/archivo.pdf»: la única forma de ruta que arma (y acepta) el servidor. */
export const QUOTE_FILE_PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(pdf|jpg|png)$/

/** Por qué no se acepta un archivo (antes de subirlo); null si está bien. */
export function quoteFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!quoteFileMime(file.name, file.type)) return 'Sube un PDF o una foto (JPG o PNG)'
  if (file.size > MAX_QUOTE_FILE) return 'El archivo pesa más de 10 MB'
  if (file.size === 0) return 'El archivo está vacío'
  return null
}
