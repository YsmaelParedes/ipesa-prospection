/* Los mensajes de WhatsApp se guardan con una marca al inicio que dice qué son ("📷 Imagen · pie", "👉 Cotizar").
   La marca se queda así en la base (los mensajes viejos y los nuevos se leen igual); en pantalla se cambia por un
   icono de la librería y en los avisos del celular se quita. */

export type MessageKind =
  | 'image' | 'audio' | 'video' | 'document' | 'sticker'
  | 'reply' | 'location' | 'contact' | 'template' | 'file' | 'handoff' | 'message'

const PREFIXES: [string, MessageKind][] = [
  ['📷', 'image'], ['🎤', 'audio'], ['🎥', 'video'], ['📄', 'document'], ['🏷️', 'sticker'], ['🏷', 'sticker'],
  ['👉', 'reply'], ['📍', 'location'], ['👤', 'contact'], ['📋', 'template'], ['📎', 'file'], ['🙋', 'handoff'], ['💬', 'message'],
]

/** Separa la marca del inicio de un renglón: `{ kind: 'image', text: 'Imagen · pie' }`. */
export function splitMessagePrefix(line: string): { kind: MessageKind | null; text: string } {
  for (const [mark, kind] of PREFIXES) {
    if (line.startsWith(mark)) return { kind, text: line.slice(mark.length).replace(/^️?\s*/u, '') }
  }
  return { kind: null, text: line }
}

/** El texto sin marcas, renglón por renglón (para avisos y textos planos). */
export function stripMessagePrefixes(text: string): string {
  return text.split('\n').map(l => splitMessagePrefix(l).text).join('\n')
}
