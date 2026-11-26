'use client'

import { Fragment, type ReactNode } from 'react'
import { ExternalLink, ImagePlus, Image as ImageIcon, Phone, RefreshCw, Reply } from 'lucide-react'
import type { TemplateButton, WhatsAppTemplateDef } from '@/lib/whatsappTemplates'
import { bodyParts } from '@/lib/campaignWizard'
import s from './WhatsAppBubble.module.css'

const FORMAT = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g

/** Texto con el formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y ```monoespaciado```. */
export function waText(text: string): ReactNode[] {
  return text.split(FORMAT).map((p, i) => {
    if (p.startsWith('```') && p.endsWith('```') && p.length > 6) return <code key={i}>{p.slice(3, -3)}</code>
    if (p.length > 2 && p[0] === p[p.length - 1]) {
      const inner = p.slice(1, -1)
      if (p[0] === '*') return <strong key={i}>{inner}</strong>
      if (p[0] === '_') return <em key={i}>{inner}</em>
      if (p[0] === '~') return <del key={i}>{inner}</del>
    }
    return <Fragment key={i}>{p}</Fragment>
  })
}

/** Ancho del dato para que crezca con lo que se escribe (sin medir el texto). */
const fieldWidth = (text: string) => `calc(${Math.max(4, text.length) * 0.56}em + 16px)`

const BUTTON_ICON = { reply: Reply, url: ExternalLink, call: Phone, other: Reply }

export type BubbleImage = {
  url: string | null
  /** Para elegir o cambiar la foto ahí mismo. */
  onFile?: (file: File) => void
  busy?: boolean
  error?: boolean
  /** Texto bajo «Elige la foto». */
  hint?: string
}

/**
 * Cómo le llega la plantilla al cliente. En `sample` los datos se marcan en
 * amarillo con su ejemplo; en `fill` se escriben ahí mismo (Campañas).
 */
export function Bubble({
  template, mode, personalize, name, values, onValue, missing, image,
}: {
  template: WhatsAppTemplateDef
  mode: 'sample' | 'fill'
  personalize: boolean
  /** Nombre que se muestra en lugar de {{1}} cuando es el nombre de cada cliente. */
  name: string
  values?: Record<number, string>
  onValue?: (v: number, text: string) => void
  /** Datos vacíos que hay que marcar (al intentar enviar). */
  missing?: Set<number>
  image?: BubbleImage
}) {
  const parts = bodyParts(template.bodyPreview, personalize)
  const buttons: TemplateButton[] = template.buttonList?.length ? template.buttonList
    : (template.buttons?.length ? template.buttons : template.buttonLabel ? [template.buttonLabel] : []).map(text => ({ kind: 'reply' as const, text }))
  const example = (v: number) => template.examples?.[v]?.trim() || 'dato'

  return (
    <span className={s.bub}>
      {template.hasImageHeader && (
        <span className={s.pic}>
          {image?.url ? <img src={image.url} alt="" /> : !image?.onFile && <span className={s.ph}><ImageIcon aria-hidden="true" /></span>}
          {image?.onFile && !image.url && (
            <label className={`${s.pick} ${image.error ? s.err : ''}`}>
              <ImagePlus aria-hidden="true" />
              {image.busy ? 'Subiendo…' : 'Elige la foto'}
              <small>{image.hint ?? 'JPG o PNG, hasta 5 MB'}</small>
              <input type="file" accept="image/jpeg,image/png" disabled={image.busy} aria-label="Elegir la foto del mensaje" data-photo-input=""
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) image.onFile!(f) }} />
            </label>
          )}
          {image?.onFile && image.url && (
            <label className={s.swap}>
              <RefreshCw aria-hidden="true" /> {image.busy ? 'Subiendo…' : 'Cambiar foto'}
              <input type="file" accept="image/jpeg,image/png" disabled={image.busy} aria-label="Cambiar la foto del mensaje"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) image.onFile!(f) }} />
            </label>
          )}
        </span>
      )}
      {template.headerText && <span className={s.hx}>{template.headerText}</span>}
      <span className={s.tx}>
        {parts.map((p, i) => {
          if ('text' in p) return <Fragment key={i}>{waText(p.text)}</Fragment>
          if ('name' in p) return <span key={i} className={s.nm}>{name}</span>
          if (mode === 'sample') return <mark key={i}>{example(p.v)}</mark>
          const value = values?.[p.v] ?? ''
          return (
            <input key={i} id={`dato-${p.v}`} data-blank="" className={`${s.bl} ${value.trim() ? s.ok : ''} ${missing?.has(p.v) && !value.trim() ? s.err : ''}`}
              value={value} maxLength={200} autoComplete="off" placeholder={`ej. ${example(p.v)}`}
              aria-label={`Dato que cambia, por ejemplo ${example(p.v)}`}
              style={{ width: fieldWidth(value || `ej. ${example(p.v)}`) }}
              onChange={e => onValue?.(p.v, e.target.value)} />
          )
        })}
      </span>
      {template.footer && <span className={s.ft}>{template.footer}</span>}
      {buttons.map((b, i) => {
        const Icon = BUTTON_ICON[b.kind] ?? Reply
        return <span key={i} className={s.bt}><Icon aria-hidden="true" />{b.text}</span>
      })}
    </span>
  )
}

/** La burbuja dentro de un chat, con el nombre de la tienda arriba. */
export function Chat({ store, children }: { store: string; children: ReactNode }) {
  const initials = store.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || 'T'
  return (
    <div className={s.chat}>
      <div className={s.ct}><i aria-hidden="true">{initials}</i>{store}</div>
      <div className={s.cb}>{children}</div>
    </div>
  )
}
