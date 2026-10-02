/**
 * Catálogos de la tienda (segmentos y canales) para formularios y filtros.
 * Se piden una sola vez por pestaña; Configuración → Catálogos llama a
 * invalidateCatalogs() al agregar o quitar opciones.
 */
import { useEffect, useState } from 'react'

export type Catalogs = { segments: string[]; canales: string[] }

const EVENT = 'crm:catalogs-changed'
const EMPTY: Catalogs = { segments: [], canales: [] }
let cache: Promise<Catalogs> | null = null

export function loadCatalogs(): Promise<Catalogs> {
  cache ??= fetch('/api/data/config', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : { items: [] }))
    .then((d: { items?: { type: string; label: string }[] }) => ({
      segments: (d.items ?? []).filter(i => i.type === 'segment').map(i => i.label),
      canales:  (d.items ?? []).filter(i => i.type === 'canal').map(i => i.label),
    }))
    .catch(() => { cache = null; return EMPTY })
  return cache
}

export function invalidateCatalogs() {
  cache = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

export function useCatalogs(): Catalogs & { loaded: boolean } {
  const [state, setState] = useState<Catalogs & { loaded: boolean }>({ ...EMPTY, loaded: false })
  useEffect(() => {
    let alive = true
    const load = () => loadCatalogs().then(c => { if (alive) setState({ ...c, loaded: true }) })
    load()
    window.addEventListener(EVENT, load)
    return () => { alive = false; window.removeEventListener(EVENT, load) }
  }, [])
  return state
}

/** El canal "WhatsApp" de la tienda (si existe) para lo que nace en la bandeja. */
export function whatsappChannel(canales: string[]): string {
  return canales.find(c => c.toLowerCase().includes('whats')) ?? canales[0] ?? 'WhatsApp'
}
