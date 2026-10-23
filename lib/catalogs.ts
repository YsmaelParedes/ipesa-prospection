import { useQueryEffect } from '@/lib/useCachedQuery'
import { apiFetch } from '@/lib/apiClient'
/**
 * Catálogos de la tienda (segmentos, canales y zonas) para formularios y filtros.
 * Se comparten durante cinco minutos; el adaptador invalida las lecturas
 * al confirmar cambios en Configuración → Catálogos.
 */
import { useState } from 'react'

export type Catalogs = { segments: string[]; canales: string[]; zones: string[] }

const EMPTY: Catalogs = { segments: [], canales: [], zones: [] }

export function loadCatalogs(): Promise<Catalogs> {
  return apiFetch('/api/data/config', { cache: 'no-store' })
    .then(r => r.json())
    .then((d: { items?: { type: string; label: string }[] }) => ({
      segments: (d.items ?? []).filter(i => i.type === 'segment').map(i => i.label),
      canales:  (d.items ?? []).filter(i => i.type === 'canal').map(i => i.label),
      zones:    (d.items ?? []).filter(i => i.type === 'zone').map(i => i.label),
    }))
}

export function useCatalogs(): Catalogs & { loaded: boolean } {
  const [state, setState] = useState<Catalogs & { loaded: boolean }>({ ...EMPTY, loaded: false })
  useQueryEffect(() => {
    let alive = true
    const load = () => loadCatalogs().then(c => { if (alive) setState({ ...c, loaded: true }) }).catch(() => { if (alive) setState(s => ({ ...s, loaded: true })) })
    load()
    return () => { alive = false }
  }, [])
  return state
}

/** El canal "WhatsApp" de la tienda (si existe) para lo que nace en la bandeja. */
export function whatsappChannel(canales: string[]): string {
  return canales.find(c => c.toLowerCase().includes('whats')) ?? canales[0] ?? 'WhatsApp'
}
