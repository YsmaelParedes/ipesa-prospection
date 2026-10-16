/**
 * Archivos que se pueden enviar desde el chat de WhatsApp (cliente y
 * servidor). El límite real lo pone Vercel: una petición no puede pasar de
 * 4.5 MB, así que se aceptan archivos de hasta 4 MB (Meta permite más).
 */

export type SendKind = 'image' | 'document' | 'video'

export const MAX_SEND_BYTES = 4 * 1024 * 1024
export const MAX_CAPTION = 1024

const DOC = 'document' as const
/** Tipos aceptados → cómo los manda WhatsApp. Los JPG/PNG van como foto; lo demás, como documento o video. */
export const SEND_TYPES: Record<string, SendKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'video/mp4': 'video',
  'application/pdf': DOC,
  'application/msword': DOC,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': DOC,
  'application/vnd.ms-excel': DOC,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': DOC,
  'application/vnd.ms-powerpoint': DOC,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': DOC,
  'text/plain': DOC,
}

/** Para el selector de archivos del navegador. */
export const SEND_ACCEPT = '.jpg,.jpeg,.png,.mp4,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt'

/** Por extensión, por si el navegador no reporta el tipo (pasa en Windows con algunos Office). */
const BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
}

export function sendMimeOf(name: string, type: string): string | null {
  if (SEND_TYPES[type]) return type
  const ext = name.toLowerCase().split('.').pop() ?? ''
  return BY_EXT[ext] ?? null
}

/** Etiqueta con la que se guarda en el historial (igual que los mensajes que llegan). */
export const SEND_LABELS: Record<SendKind, string> = { image: '📷 Imagen', video: '🎥 Video', document: '📄 Documento' }

/**
 * Revisa que el contenido corresponda al tipo (no basta con la extensión):
 * JPG, PNG, PDF, MP4, Office moderno (ZIP) y Office 97-2003 (OLE).
 */
export function contentMatches(mime: string, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (mime) {
    case 'image/jpeg': return starts(0xFF, 0xD8, 0xFF)
    case 'image/png': return starts(0x89, 0x50, 0x4E, 0x47)
    case 'application/pdf': return starts(0x25, 0x50, 0x44, 0x46)                       // %PDF
    case 'video/mp4': return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70   // ....ftyp
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return starts(0x50, 0x4B, 0x03, 0x04)                                               // ZIP
    case 'application/msword':
    case 'application/vnd.ms-excel':
    case 'application/vnd.ms-powerpoint':
      return starts(0xD0, 0xCF, 0x11, 0xE0)                                               // OLE
    case 'text/plain': return !bytes.slice(0, 512).includes(0)                           // sin bytes nulos
    default: return false
  }
}

/** Nombre seguro para mostrarlo al cliente en WhatsApp. */
export function cleanFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return (base || 'archivo').slice(0, 200)
}

export const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
