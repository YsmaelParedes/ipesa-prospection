/**
 * Avisos entre partes de la app (solo navegador):
 *  - "crear algo" desde cualquier pantalla: el formulario vive una sola vez
 *    en el shell (components/QuickCreate.tsx) y cualquiera puede abrirlo;
 *  - "cambiaron los datos": cada pantalla recarga lo que muestra.
 */
import { useEffect, useRef } from 'react'
import type { ContactLite, Reminder, ReminderType } from './crm'

export type DataKind = 'contact' | 'lead' | 'reminder' | 'activity'

const CHANGED = 'crm:data-changed'
const QUICK   = 'crm:quick-create'

export function notifyDataChanged(kind: DataKind) {
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { kind } }))
}

/** Ejecuta `cb` cuando cambian los datos de alguno de esos tipos. */
export function useDataChanged(kinds: DataKind[], cb: () => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  const key = kinds.join(',')
  useEffect(() => {
    const wanted = key.split(',')
    const h = (e: Event) => { if (wanted.includes((e as CustomEvent).detail?.kind)) cbRef.current() }
    window.addEventListener(CHANGED, h)
    return () => window.removeEventListener(CHANGED, h)
  }, [key])
}

export type ReminderDefaults = {
  lead_id?: string | null
  /** Nombre del cliente o del lead (queda como "de quién es" el recordatorio). */
  lead_name?: string
  nota?: string
  type?: ReminderType
  /** "YYYY-MM-DDTHH:MM" */
  fecha?: string
}

export type QuickCreateRequest =
  | { kind: 'contact'; name?: string; phone?: string }
  | { kind: 'lead'; contact?: ContactLite }
  | { kind: 'reminder'; reminder?: Reminder; defaults?: ReminderDefaults }

export function openQuickCreate(req: QuickCreateRequest) {
  window.dispatchEvent(new CustomEvent(QUICK, { detail: req }))
}

export function useQuickCreateRequests(cb: (req: QuickCreateRequest) => void) {
  const cbRef = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    const h = (e: Event) => { const req = (e as CustomEvent).detail; if (req?.kind) cbRef.current(req) }
    window.addEventListener(QUICK, h)
    return () => window.removeEventListener(QUICK, h)
  }, [])
}
