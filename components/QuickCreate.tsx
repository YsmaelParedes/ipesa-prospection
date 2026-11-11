'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ContactFormModal from '@/components/ContactFormModal'
import ReminderModal from '@/components/ReminderModal'
import {
  notifyDataChanged, openQuickCreate, useQuickCreateRequests,
  type DataKind, type QuickCreateRequest,
} from '@/lib/crmEvents'
import { Check, ChevronDown, Clock, Plus, UserPlus } from 'lucide-react'

const Ico = {
  plus:     () => <Plus aria-hidden="true" />,
  chevron:  () => <ChevronDown aria-hidden="true" />,
  contact:  () => <UserPlus aria-hidden="true" />,
  reminder: () => <Clock aria-hidden="true" />,
  check:    () => <Check aria-hidden="true" />,
}

const ITEMS: { kind: QuickCreateRequest['kind']; label: string; hint: string; icon: React.ComponentType; tone: string }[] = [
  { kind: 'contact',  label: 'Contacto',     hint: 'Un cliente nuevo en tu base',  icon: Ico.contact,  tone: 'cyan' },
  { kind: 'reminder', label: 'Recordatorio', hint: 'Una llamada, visita o tarea',  icon: Ico.reminder, tone: 'amber' },
]

function QuickItems({ onPick }: { onPick: () => void }) {
  return (
    <>
      {ITEMS.map(it => (
        <button key={it.kind} role="menuitem" className="qc-item" onClick={() => { onPick(); openQuickCreate({ kind: it.kind } as QuickCreateRequest) }}>
          <span className={`qc-icon tone-${it.tone}`}><it.icon /></span>
          <span className="qc-text"><strong>{it.label}</strong><small>{it.hint}</small></span>
        </button>
      ))}
    </>
  )
}

/** Botón "+ Nuevo" de la barra superior (computadora). */
export function QuickCreateMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="qc-wrap" ref={ref}>
      <button className="btn btn-primary qc-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Ico.plus /> Nuevo <span className="qc-chev"><Ico.chevron /></span>
      </button>
      {open && <div className="qc-menu" role="menu"><QuickItems onPick={() => setOpen(false)} /></div>}
    </div>
  )
}

/**
 * Botón flotante (celular). En una lista crea directo lo de esa pantalla
 * (contacto o recordatorio); en Inicio ofrece las opciones en una hoja.
 */
export function QuickCreateFab({ kind }: { kind?: 'contact' | 'reminder' }) {
  const [open, setOpen] = useState(false)
  const item = kind ? ITEMS.find(it => it.kind === kind) : null
  return (
    <>
      <button className="fab" onClick={() => (kind ? openQuickCreate({ kind } as QuickCreateRequest) : setOpen(true))}
        aria-label={item ? `Nuevo ${item.label.toLowerCase()}` : 'Crear nuevo'} aria-haspopup={kind ? 'dialog' : 'menu'}>
        <Ico.plus />
      </button>
      {open && (
        <div className="modal" onClick={() => setOpen(false)}>
          <div className="modal-card qc-sheet" onClick={e => e.stopPropagation()} role="menu" aria-label="Crear nuevo">
            <div className="qc-sheet-title">Crear nuevo</div>
            <QuickItems onPick={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Formularios de alta compartidos: se montan una sola vez en el shell y los
 * abre cualquier pantalla con openQuickCreate(). Al guardar avisan a las
 * pantallas para que recarguen y ofrecen ir al registro nuevo.
 */
export function QuickCreateHost() {
  const [req, setReq] = useState<QuickCreateRequest | null>(null)
  const [toast, setToast] = useState<{ text: string; href?: string; action?: string } | null>(null)
  useQuickCreateRequests(setReq)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const done = (kind: DataKind, text: string, href?: string, action?: string) => {
    setReq(null)
    notifyDataChanged(kind)
    setToast({ text, href, action })
  }
  const close = () => setReq(null)

  return (
    <>
      {req?.kind === 'contact' && (
        <ContactFormModal initialName={req.name} initialPhone={req.phone} onClose={close}
          onSaved={c => done('contact', 'Contacto guardado', `/contactos?id=${c.id}`, 'Ver ficha')} />
      )}
      {req?.kind === 'reminder' && (
        <ReminderModal reminder={req.reminder} defaults={req.defaults} onClose={close}
          onSaved={() => done('reminder', req.reminder ? 'Recordatorio actualizado' : 'Recordatorio creado', '/recordatorios', 'Ver agenda')} />
      )}
      {toast && (
        <div className="toast-fixed" role="status">
          <span className="toast-check"><Ico.check /></span>
          {toast.text}
          {toast.href && <Link href={toast.href} className="toast-action" onClick={() => setToast(null)}>{toast.action}</Link>}
        </div>
      )}
    </>
  )
}
