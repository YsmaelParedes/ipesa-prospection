'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, TriangleAlert, type LucideIcon } from 'lucide-react'

/**
 * Ventana pequeña para confirmar una acción (eliminar, quitar, desconectar…).
 * Es la única forma de pedir confirmación en la app: nada de «¿Seguro? Sí / No»
 * dentro de la fila.
 *
 * - Esc o clic fuera cancelan; mientras `busy` no se cierra.
 * - El foco empieza en «Cancelar» (lo seguro) y vuelve a donde estaba al cerrar.
 * - Quien la usa decide cuándo cerrarla: con acciones que tardan, deja `open`
 *   hasta que termine y muestra `busyLabel` mientras tanto.
 */
export function ConfirmDialog({
  open, title, children, confirmLabel, busyLabel, cancelLabel = 'Cancelar',
  tone = 'danger', icon, busy = false, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  children?: React.ReactNode
  confirmLabel: string
  busyLabel?: string
  cancelLabel?: string
  /** danger: rojo (borrar, quitar). warn: ámbar (acciones con costo o que cambian algo importante). */
  tone?: 'danger' | 'warn'
  icon?: LucideIcon
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const textId = useId()

  useEffect(() => { setMounted(true) }, [])

  // Foco inicial en Cancelar y regreso al botón que abrió la ventana
  useEffect(() => {
    if (!open) return
    const before = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => { before?.focus?.() }
  }, [open])

  // Esc cancela y Tab se queda dentro de la ventana
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!busy) onCancel()
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, busy, onCancel])

  if (!open || !mounted) return null

  const Icon = icon ?? (tone === 'danger' ? Trash2 : TriangleAlert)

  return createPortal(
    <div className="cdlg" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <div ref={cardRef} className={`cdlg-card cdlg-${tone}`} role="alertdialog" aria-modal="true"
        aria-labelledby={titleId} aria-describedby={children ? textId : undefined}>
        <div className="cdlg-head">
          <span className="cdlg-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
          <div className="cdlg-copy">
            <h2 id={titleId} className="cdlg-title">{title}</h2>
            {children && <div id={textId} className="cdlg-text">{children}</div>}
          </div>
        </div>
        <div className="cdlg-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-dark'}`} onClick={onConfirm} disabled={busy}>
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
