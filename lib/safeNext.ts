const BASE = 'http://ipesa.invalid'

/**
 * Solo rutas internas ("/algo"): evita redirecciones abiertas a otros sitios.
 * Rechaza "//otro.com", barras invertidas y cualquier espacio o carácter de
 * control (el navegador quita tabuladores y saltos de línea antes de
 * interpretar la URL, así que "/\t/otro.com" acabaría en otro sitio).
 */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || /[\x00-\x20\x7f\\]/.test(next)) return fallback
  try {
    const url = new URL(next, BASE)
    const path = url.pathname + url.search + url.hash
    // La normalización puede producir "//otro.com" (p. ej. "/.//otro.com"): se vuelve a comprobar
    if (url.origin !== BASE || path.startsWith('//') || new URL(path, BASE).origin !== BASE) return fallback
    return path
  } catch {
    return fallback
  }
}
