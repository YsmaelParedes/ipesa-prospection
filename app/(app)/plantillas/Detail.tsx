'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Clock, Copy, Megaphone, PauseCircle, PenLine, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Bubble, Chat } from '@/components/WhatsAppBubble'
import { templateTitle } from '@/lib/campaignWizard'
import { NAME_EXAMPLE } from '@/lib/templateBuilder'
import { rejectionText, templateState, type ManagedTemplate } from '@/lib/whatsappTemplates'
import { CATEGORY_LABEL, StatusBadge, fmt, keyOf, languageLabel, type TemplateStats } from './ui'
import s from './plantillas.module.css'

/** Lo que Matices aún no sabe editar (se ve y se usa, pero se corrige en WhatsApp). */
export function notEditable(t: ManagedTemplate): string | null {
  if (t.headerFormat && !['TEXT', 'IMAGE'].includes(t.headerFormat)) return 'tiene un encabezado de video o documento'
  if (t.headerFormat === 'TEXT' && !t.headerText) return 'tiene datos que cambian en el encabezado'
  if (t.buttonList?.some(b => b.kind === 'other')) return 'tiene botones que Matices todavía no maneja'
  if (t.category === 'AUTHENTICATION') return 'es de autenticación'
  return null
}

/** «El nombre de cada cliente y 2 que escribes al mandarla». */
function dataText(t: ManagedTemplate): string {
  const total = t.variableCount ?? 0
  if (!total) return 'Ninguno: el texto es igual para todos'
  const others = total - (t.clientName ? 1 : 0)
  const text = [t.clientName && 'el nombre de cada cliente', others > 0 && `${others} que escribes al mandarla`].filter(Boolean).join(' y ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Una plantilla: cómo se ve, su estado (y el motivo si WhatsApp la rechazó
 * o la pausó), cómo le fue en campañas y lo que se puede hacer con ella.
 */
export function TemplateDetail({ t, store, stats, campaigns, onBack, onEdit, onDuplicate, onDeleted }: {
  t: ManagedTemplate
  store: string
  stats: TemplateStats | null | undefined
  /** La tienda tiene Campañas (para «Usar en una campaña» y los números). */
  campaigns: boolean
  onBack: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDeleted: () => void
}) {
  const st = templateState(t.status)
  const image = useCachedQuery<{ url: string | null }>(t.hasImageHeader ? `/api/whatsapp/template-image?template=${encodeURIComponent(t.name)}` : null).data?.url ?? null
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = notEditable(t)

  const remove = async () => {
    setBusy(true); setError('')
    try {
      const qs = new URLSearchParams({ name: t.name, language: t.language, ...(t.id ? { id: t.id } : {}) })
      const r = await apiFetch(`/api/whatsapp/templates/manage?${qs}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error)
      setConfirm(false)
      onDeleted()
    } catch (e) {
      setError((e as Error).message || 'No se pudo eliminar. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={s.rhead}>
        <button type="button" className={s.back} onClick={onBack} aria-label="Volver a Plantillas"><ArrowLeft aria-hidden="true" /></button>
        <div style={{ minWidth: 0 }}>
          <h2>{templateTitle(t.name)}</h2>
          <p><StatusBadge status={t.status} />{[CATEGORY_LABEL[t.category ?? ''] ?? t.category, languageLabel(t.language)].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      {st === 'rejected' && (
        <div className={`${s.banner} ${s.bad}`} role="alert">
          <AlertTriangle aria-hidden="true" />
          <div className={s.g}><b>WhatsApp la rechazó</b>{rejectionText(t.rejectedReason)}</div>
          {!locked && <button type="button" className={`btn btn-primary ${s.press}`} onClick={onEdit}>Corregir</button>}
        </div>
      )}
      {st === 'paused' && (
        <div className={`${s.banner} ${s.warn}`}>
          <PauseCircle aria-hidden="true" />
          <div className={s.g}><b>WhatsApp la pausó</b>Varios clientes la bloquearon o la reportaron. WhatsApp la reactiva sola en unas horas; mientras, revisa el texto y mándala solo a quien aceptó recibir tus mensajes.</div>
        </div>
      )}
      {st === 'review' && (
        <div className={`${s.banner} ${s.info}`}>
          <Clock aria-hidden="true" />
          <div className={s.g}><b>WhatsApp la está revisando</b>Normalmente tarda unos minutos y como máximo 24 horas. Toca «Actualizar» en la lista para ver si ya quedó.</div>
        </div>
      )}
      {st === 'off' && (
        <div className={`${s.banner} ${s.warn}`}>
          <AlertTriangle aria-hidden="true" />
          <div className={s.g}><b>WhatsApp la desactivó</b>No se puede enviar. Puedes duplicarla y mandar la copia a revisión.</div>
        </div>
      )}

      <div className={s.detail}>
        <Chat store={store}>
          <Bubble template={t} mode="sample" personalize={!!t.clientName} name={NAME_EXAMPLE} image={{ url: image }} />
        </Chat>
        <div>
          {campaigns && (
            <div className={s.trio}>
              <div><b>{stats ? fmt(stats.sent) : '0'}</b><span>enviados</span></div>
              <div><b>{stats ? fmt(stats.seen) : '0'}</b><span>leídos</span></div>
              <div><b>{stats ? fmt(stats.replied) : '0'}</b><span>respondieron</span></div>
            </div>
          )}
          <div className={s.acts}>
            {campaigns && st === 'ok' && !t.unsupported && (
              <Link className={`btn btn-primary ${s.press}`} href={`/campanas?plantilla=${encodeURIComponent(keyOf(t))}`}><Megaphone aria-hidden="true" /> Usar en una campaña</Link>
            )}
            {/* WhatsApp solo deja editar las aprobadas y las rechazadas */}
            {!locked && (st === 'ok' || st === 'rejected') && (
              <button type="button" className={`btn btn-ghost ${s.press}`} onClick={onEdit}><PenLine aria-hidden="true" /> {st === 'rejected' ? 'Corregir' : 'Editar'}</button>
            )}
            {!locked && <button type="button" className={`btn btn-ghost ${s.press}`} onClick={onDuplicate}><Copy aria-hidden="true" /> Duplicar</button>}
          </div>
          <dl className={s.facts}>
            <div><dt>Nombre</dt><dd>{t.name}</dd></div>
            <div><dt>Datos</dt><dd>{dataText(t)}</dd></div>
          </dl>
          {locked && <p className={s.mut} style={{ marginBottom: 14 }}>Esta plantilla {locked}: se puede usar, pero para cambiarla hay que hacerlo en el administrador de WhatsApp.</p>}
          {st === 'ok' && <p className={s.mut} style={{ marginBottom: 14 }}>Al editar una plantilla aprobada vuelve a revisión. WhatsApp deja editarla una vez al día y hasta 10 veces al mes.</p>}
          <button type="button" className={`${s.lk} ${s.danger}`} onClick={() => { setError(''); setConfirm(true) }}><Trash2 aria-hidden="true" /> Eliminar plantilla</button>
        </div>
      </div>

      <ConfirmDialog open={confirm} title="¿Eliminar la plantilla?" confirmLabel="Eliminar" busyLabel="Eliminando…" busy={busy} error={error}
        onConfirm={() => void remove()} onCancel={() => setConfirm(false)}>
        Se elimina en WhatsApp y ya no se podrá enviar. El nombre «{t.name}» no se podrá volver a usar durante 30 días.
      </ConfirmDialog>
    </>
  )
}
