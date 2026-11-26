'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, ArrowLeft, Check, ChevronRight, Clock, PenLine, Search, Send, Users, X } from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { loadCatalogs } from '@/lib/catalogs'
import { segmentColor } from '@/components/CrmUI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useCampaignSend } from '@/components/WhatsAppCampaignSend'
import type { CampaignQuota } from '@/components/WhatsAppCampaignQuota'
import type { WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import type { WhatsAppTemplateDef } from '@/lib/whatsappTemplates'
import type { AudienceContact } from '@/lib/campaignAudience'
import type { CampaignPending } from '@/lib/campaignPending'
import { fmtPhone } from '@/lib/phone'
import {
  ALL_CLIENTS, BLOCK_TAG, OUT_WHY, blanksOf, firstNameOf, fullNames, groupContacts, isMarketing, looksLikeName,
  paramsFor, segmentOf, shortNames, templateTitle, variablesOf, type OutReason,
} from '@/lib/campaignWizard'
import { Bubble, Chat } from './Bubble'
import { WizardSkeleton } from './Skeletons'
import s from './campanas.module.css'

/** Cómo empieza el asistente: de cero, con lo que faltó del límite del día o reintentando. */
export type WizardStart =
  | { kind: 'new' }
  | { kind: 'pending'; pending: CampaignPending }
  | { kind: 'retry'; template: string; contactIds: string[]; campaignId: string | null; label: string | null }

type Step = 'who' | 'pick' | 'tpl' | 'send'
type Status = { health?: { displayPhoneNumber?: string; verifiedName?: string } | null }

const STEPS = ['A quién', 'Plantilla', 'Enviar']
const stepIndex = (st: Step) => (st === 'who' || st === 'pick' ? 1 : st === 'tpl' ? 2 : 3)
const fmt = (n: number) => n.toLocaleString('es-MX')
const pl = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`
const keyOf = (t: { name: string; language: string }) => `${t.name}|${t.language}`
const SHOWN = 40
/** Para buscar sin importar mayúsculas ni acentos. */
const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Nueva campaña a pantalla completa: A quién → Plantilla → Enviar, luego el
 * avance del envío y cómo salió. Lo que no cabe en el límite del día de Meta
 * se guarda para mandarlo otro día con el mismo mensaje.
 */
export function CampaignWizard({ start, store, onClose, onResults }: {
  start: WizardStart
  store: string
  onClose: () => void
  /** Ver los resultados de la campaña (id del envío). */
  onResults: (campaignId: string) => void
}) {
  // ── Datos (una sola vez: el envío por lotes invalida WhatsApp y no hace falta recargarlos) ──
  const [contacts, setContacts] = useState<AudienceContact[] | null>(null)
  const [segments, setSegments] = useState<string[]>([])
  const [templates, setTemplates] = useState<WhatsAppTemplateDef[] | null>(null)
  const [templatesError, setTemplatesError] = useState('')
  const [quota, setQuota] = useState<CampaignQuota | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let alive = true
    apiFetch('/api/whatsapp/campaigns/audience').then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!alive) return
      if (r.ok && Array.isArray(d.contacts)) setContacts(d.contacts)
      else setLoadError(d.error || 'No se pudieron cargar tus clientes')
    }).catch(() => { if (alive) setLoadError('No se pudieron cargar tus clientes. Revisa tu conexión.') })
    loadCatalogs().then(c => { if (alive) setSegments(c.segments) }).catch(() => {})
    apiFetch('/api/whatsapp/templates').then(r => r.json()).then(d => {
      if (!alive) return
      setTemplates(d.templates ?? []); setTemplatesError(d.error ?? '')
    }).catch(() => { if (alive) { setTemplates([]); setTemplatesError('No se pudieron consultar tus plantillas') } })
    apiFetch('/api/whatsapp/campaigns/send').then(r => (r.ok ? r.json() : null)).then(d => { if (alive) setQuota(d) }).catch(() => {})
    apiFetch('/api/whatsapp/status').then(r => (r.ok ? r.json() : null)).then(d => { if (alive) setStatus(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // ── Lo que se va eligiendo ──
  const preset = start.kind === 'pending'
    ? { ids: start.pending.contactIds, template: start.pending.template, language: start.pending.language as string | null }
    : start.kind === 'retry' ? { ids: start.contactIds, template: start.template, language: null } : null
  const [step, setStep] = useState<Step>(preset ? 'send' : 'who')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preset?.ids ?? []))
  const [q, setQ] = useState('')
  const [tplKey, setTplKey] = useState<string | null>(null)
  const [nameMode, setNameMode] = useState<boolean | null>(start.kind === 'pending' ? start.pending.personalize : null)
  const [values, setValues] = useState<Record<number, string>>(() => {
    if (start.kind !== 'pending') return {}
    return Object.fromEntries(start.pending.bodyParams.map((v, i) => [i, v]).filter(([, v]) => v))
  })
  const [miss, setMiss] = useState(false)
  const [why, setWhy] = useState(false)
  const [image, setImage] = useState<{ url: string | null; busy: boolean; error: string }>({ url: null, busy: false, error: '' })
  const [confirm, setConfirm] = useState(false)
  const [firstId] = useState(() => start.kind === 'pending' ? start.pending.campaignId : start.kind === 'retry' && start.campaignId ? start.campaignId : crypto.randomUUID())
  const campaignId = useRef(firstId)

  const send = useCampaignSend()
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form')
  const [outcome, setOutcome] = useState<{ sent: number; failed: number; later: number; stopped: boolean; stop: string } | null>(null)
  const stoppedByUser = useRef(false)

  // La plantilla del reintento o de lo pendiente, en cuanto llegan las plantillas
  useEffect(() => {
    if (!preset || !templates || tplKey) return
    const t = templates.find(x => x.name === preset.template && (!preset.language || x.language === preset.language) && !x.unsupported)
    if (t) setTplKey(keyOf(t))
    else setStep('tpl')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates])

  const template = templates?.find(t => keyOf(t) === tplKey) ?? null
  const marketing = isMarketing(template?.category)
  const hasFirst = !!template && variablesOf(template.bodyPreview).includes(0)
  const personalize = hasFirst && (nameMode ?? looksLikeName(template!.bodyPreview))
  const blanks = template ? blanksOf(template.bodyPreview, personalize) : []
  const missing = blanks.filter(v => !(values[v] ?? '').trim())

  // La foto guardada de la plantilla (se reutiliza en cada envío)
  useEffect(() => {
    setImage({ url: start.kind === 'pending' && template?.name === start.pending.template ? start.pending.headerImageUrl : null, busy: false, error: '' })
    if (!template?.hasImageHeader) return
    let alive = true
    apiFetch(`/api/whatsapp/template-image?template=${encodeURIComponent(template.name)}`).then(r => r.json())
      .then(d => { if (alive && d.url) setImage(i => ({ ...i, url: d.url })) }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.name, template?.hasImageHeader])

  // ── A quién ──
  const byId = useMemo(() => new Map((contacts ?? []).map(c => [c.id, c])), [contacts])
  const groups = useMemo(() => groupContacts(contacts ?? [], segments), [contacts, segments])
  const eligible = useMemo(() => groups.reduce((n, g) => n + g.ids.length, 0), [groups])
  // Solo cuenta quien puede recibirla (lo pendiente o un reintento pueden traer a alguien que ya se dio de baja)
  const chosen = useMemo(() => groups.flatMap(g => g.ids.filter(id => picked.has(id))).map(id => byId.get(id)!), [groups, picked, byId])
  const inGroup = (ids: string[]) => ids.reduce((n, id) => n + (picked.has(id) ? 1 : 0), 0)
  const chosenGroups = groups.filter(g => inGroup(g.ids) > 0).map(g => g.name)
  const everyone = chosen.length > 0 && chosen.length === eligible
  const label = start.kind === 'new' ? (everyone ? ALL_CLIENTS : shortNames(chosenGroups)) : (start.kind === 'pending' ? start.pending.label : start.label) ?? shortNames(chosenGroups)

  const left = quota?.remaining ?? Infinity
  const held = marketing ? chosen.filter(c => c.hold) : []
  const sendable = held.length ? chosen.filter(c => !c.hold) : chosen
  const today = sendable.slice(0, left)
  const later = sendable.slice(today.length)

  // Quién del grupo elegido completo no puede recibirla, y por qué
  const outs = useMemo(() => {
    const m: Partial<Record<OutReason, number>> = {}
    for (const g of groups) {
      if (inGroup(g.ids) !== g.ids.length) continue
      for (const [k, n] of Object.entries(g.blocked) as [OutReason, number][]) m[k] = (m[k] ?? 0) + n
    }
    if (held.length) m.hold = held.length
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, picked, held.length])
  const outTotal = Object.values(outs).reduce((a, n) => a + (n ?? 0), 0)

  const toggle = (ids: string[], on: boolean) => setPicked(prev => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })

  // ── Navegación ──
  const scroller = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const go = (next: Step) => { setStep(next); setWhy(false) }
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    if (step === 'pick') { if (matchMedia('(min-width: 821px)').matches) document.getElementById('buscar-personas')?.focus() }
    else title.current?.focus({ preventScroll: true })
  }, [step])

  // Sin scroll de la página detrás; al enviar, aviso si se intenta cerrar la pestaña
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    if (phase !== 'sending') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  const chooseTemplate = (t: WhatsAppTemplateDef) => {
    if (keyOf(t) !== tplKey) { setValues({}); setMiss(false); setNameMode(null) }
    setTplKey(keyOf(t))
    go('send')
    if (matchMedia('(min-width: 821px)').matches) setTimeout(() => document.querySelector<HTMLInputElement>(`.${s.bl}`)?.focus(), 60)
  }

  const uploadImage = async (file: File) => {
    if (!template) return
    if (!/^image\/(jpeg|png)$/.test(file.type)) { setImage(i => ({ ...i, error: 'Usa una foto JPG o PNG (son las que acepta WhatsApp).' })); return }
    if (file.size > 5 * 1024 * 1024) { setImage(i => ({ ...i, error: 'La foto pesa más de 5 MB.' })); return }
    setImage(i => ({ ...i, busy: true, error: '' }))
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('template', template.name)
      const r = await apiFetch('/api/whatsapp/template-image', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      setImage(i => (r.ok ? { url: d.url, busy: false, error: '' } : { ...i, busy: false, error: d.error || 'No se pudo subir la foto' }))
    } catch {
      setImage(i => ({ ...i, busy: false, error: 'No se pudo subir la foto. Revisa tu conexión.' }))
    }
  }

  const needsImage = !!template?.hasImageHeader && !image.url
  const ask = () => {
    if (missing.length || needsImage) {
      setMiss(true)
      if (needsImage) setImage(i => ({ ...i, error: i.error || 'Falta elegir la foto.' }))
      const first = missing.length ? document.getElementById(`dato-${missing[0]}`) : document.querySelector<HTMLElement>(`.${s.pick} input`)
      first?.focus(); first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    setConfirm(true)
  }

  const run = async () => {
    if (!template) return
    setConfirm(false)
    setPhase('sending')
    stoppedByUser.current = false
    const selection: WhatsAppTemplateSelection = {
      templateName: template.name, language: template.language, category: template.category,
      bodyPreview: template.bodyPreview, savedImageUrl: image.url ?? '', personalize,
      bodyParams: paramsFor(template.bodyPreview, personalize, values), ready: true,
    }
    // Lo pendiente y un reintento siguen la misma campaña, salvo que se cambie la plantilla
    const startTemplate = start.kind === 'pending' ? start.pending.template : start.kind === 'retry' ? start.template : null
    if (startTemplate && template.name !== startTemplate && campaignId.current === firstId) campaignId.current = crypto.randomUUID()
    const targets = today.map(c => ({ id: c.id, name: c.name, phone: c.phone }))
    const results = await send.run(targets, selection, label ?? undefined, campaignId.current)
    const tried = new Set(results.map(o => o.contactId))
    // Si se detuvo solo (no tú), quienes no se alcanzaron también quedan pendientes
    const untried = stoppedByUser.current ? [] : today.filter(c => !tried.has(c.id)).map(c => c.id)
    const rest = [...untried, ...later.map(c => c.id)]
    try {
      // Lo pendiente de antes ya se atendió (o pasa a la campaña nueva, si se cambió la plantilla)
      if (!stoppedByUser.current && start.kind === 'pending' && (campaignId.current !== firstId || !rest.length)) {
        await apiFetch(`/api/whatsapp/campaigns/pending?campaignId=${firstId}`, { method: 'DELETE' })
      }
      if (!stoppedByUser.current && rest.length) {
        await apiFetch('/api/whatsapp/campaigns/pending', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: campaignId.current, label, template: template.name, language: template.language,
            category: template.category, headerImageUrl: image.url || undefined, bodyPreview: template.bodyPreview,
            personalize, bodyParams: selection.bodyParams, contactIds: rest,
          }),
        })
      }
    } catch { /* lo pendiente es una ayuda: el envío ya salió */ }
    setOutcome({
      sent: results.filter(o => o.ok).length,
      failed: results.filter(o => !o.ok).length,
      later: stoppedByUser.current ? 0 : rest.length,
      stopped: stoppedByUser.current,
      stop: stoppedByUser.current ? '' : send.stopReasonRef.current,
    })
    setPhase('done')
  }

  // ── Pantallas ──
  if (phase === 'sending') {
    const n = Math.max(send.total, 1)
    return portal(
      <div className={s.cen} role="status" aria-live="polite">
        <div>
          <h2>{fmt(send.done)} de {fmt(send.total)}</h2>
          <div className={s.pbar} role="progressbar" aria-label="Avance del envío" aria-valuemin={0} aria-valuemax={send.total} aria-valuenow={send.done}>
            <i style={{ width: `${(send.done / n) * 100}%` }} />
          </div>
          <p>Enviando. No cierres esta ventana.</p>
          <button type="button" className={s.lk} onClick={() => { stoppedByUser.current = true; send.cancel() }}>Detener</button>
        </div>
      </div>,
    )
  }

  if (phase === 'done' && outcome) {
    const sentTotal = outcome.sent + outcome.failed
    return portal(
      <div className={s.cen}>
        <div>
          <span className={`${s.bigic} ${outcome.stopped || !outcome.sent ? s.w : ''}`}>{outcome.stopped || !outcome.sent ? <AlertCircle aria-hidden="true" /> : <Check aria-hidden="true" />}</span>
          <h2>{outcome.stopped ? 'Envío detenido' : outcome.sent ? 'Campaña enviada' : 'No se pudo enviar'}</h2>
          <p>
            {outcome.stopped
              ? `${pl(outcome.sent, 'persona la recibió', 'personas la recibieron')}. Las demás no recibieron nada.`
              : <>
                {outcome.sent > 0 && `Salió a ${pl(outcome.sent, 'persona', 'personas')}.`}
                {outcome.failed > 0 && ` ${pl(outcome.failed, 'no se pudo enviar', 'no se pudieron enviar')}.`}
                {outcome.later > 0 && ` Las otras ${fmt(outcome.later)} quedan para mañana: te esperan en Campañas.`}
              </>}
          </p>
          {outcome.stop && <p className={`${s.note} ${s.wn}`}><AlertCircle aria-hidden="true" /><span>{outcome.stop}</span></p>}
          <div className={s.as}>
            <button type="button" className={`btn btn-ghost ${s.press}`} onClick={onClose}>Volver a Campañas</button>
            {sentTotal > 0 && <button type="button" className={`btn btn-primary ${s.press}`} onClick={() => onResults(campaignId.current)}>Ver resultados</button>}
          </div>
        </div>
      </div>,
    )
  }

  const n = chosen.length
  const nextBtn = (
    <>
      <button type="button" className={`btn btn-primary ${s.big} ${s.press}`} disabled={!n} onClick={() => go(template ? 'send' : 'tpl')}>
        {n ? `Continuar con ${pl(n, 'persona', 'personas')}` : 'Elige al menos uno'}
      </button>
      {n > left && <p className={`${s.note} ${s.wn}`}><Clock aria-hidden="true" /><span>Hoy salen {fmt(left)}; las demás, mañana.</span></p>}
    </>
  )

  const idx = stepIndex(step)
  const ready = !!contacts && !!templates
  let body: React.ReactNode
  if (loadError) {
    body = <div className={s.wc}><p className={`${s.note} ${s.bad}`}><AlertCircle aria-hidden="true" /><span>{loadError}</span></p></div>
  } else if (!ready) {
    body = <WizardSkeleton step={idx} />
  } else if (step === 'who') {
    body = (
      <div className={s.wc}>
        <h2 className={s.tt} ref={title} tabIndex={-1}>¿A quién se la mandas?</h2>
        <p className={s.st}>Puedes elegir varios.</p>
        {!eligible ? (
          <p className={s.mut}>Aún no tienes clientes con celular a quienes mandarles una campaña.</p>
        ) : (
          <div>
            <GroupRow id="todos" label={ALL_CLIENTS} k={everyone ? eligible : chosen.length} total={eligible}
              onChange={on => toggle(groups.flatMap(g => g.ids), on)} />
            {groups.map((g, i) => (
              <GroupRow key={g.name} id={String(i)} label={g.name} dot={segmentColor(g.name)} k={inGroup(g.ids)} total={g.ids.length}
                onChange={on => toggle(g.ids, on)} />
            ))}
            <button type="button" className={s.row} onClick={() => { setQ(''); go('pick') }}>
              <span className={s.ri}><Search aria-hidden="true" /></span><span className={s.g}>Buscar personas</span><ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={s.stick}>{nextBtn}</div>
      </div>
    )
  } else if (step === 'pick') {
    const term = plain(q.trim())
    const digits = term.replace(/\D/g, '')
    const all = (contacts ?? []).filter(c => !term || plain(c.name ?? '').includes(term) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits)))
    const list = all.slice(0, SHOWN)
    body = (
      <div className={s.wc}>
        <button type="button" className={`${s.lk} ${s.lkBare}`} style={{ marginBottom: 8 }} onClick={() => go('who')}><ArrowLeft aria-hidden="true" />Grupos</button>
        <h2 className={s.tt} ref={title} tabIndex={-1}>Agrega o quita personas</h2>
        <label className={s.srch}>
          <Search aria-hidden="true" />
          <input id="buscar-personas" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono" aria-label="Buscar por nombre o teléfono" autoComplete="off" />
        </label>
        <div>
          {list.length ? list.map(c => (
            <label key={c.id} className={`${s.row} ${c.block ? s.off : ''}`}>
              <input type="checkbox" checked={!c.block && picked.has(c.id)} disabled={!!c.block} onChange={e => toggle([c.id], e.target.checked)} />
              <span className={s.g}>{c.name || fmtPhone(c.phone)}<small>{segmentOf(c)}{c.name ? ` · ${fmtPhone(c.phone)}` : ''}</small></span>
              {c.block && <span className={s.tag}>{BLOCK_TAG[c.block]}</span>}
            </label>
          )) : <p className={s.mut} style={{ padding: '22px 4px' }}>Nadie coincide con «{q.trim()}».</p>}
          {all.length > SHOWN && <p className={s.mut} style={{ padding: '16px 4px', margin: 0 }}>Busca por nombre para ver a los otros {fmt(all.length - SHOWN)}.</p>}
        </div>
        <div className={s.stick}>{nextBtn}</div>
      </div>
    )
  } else if (step === 'tpl') {
    const list = [...(templates ?? [])].sort((a, b) => Number(!!a.unsupported) - Number(!!b.unsupported))
    const sameName = (t: WhatsAppTemplateDef) => list.filter(x => x.name === t.name).length > 1
    body = (
      <div className={`${s.wc} ${s.wide}`}>
        <h2 className={s.tt} ref={title} tabIndex={-1}>¿Qué plantilla?</h2>
        <p className={s.st}>Así le llega a tu cliente. Lo amarillo lo llenas en el siguiente paso.</p>
        {!list.length ? (
          <p className={s.mut}>
            {templatesError || 'Aún no tienes plantillas aprobadas por WhatsApp.'}{' '}
            <a className={s.lk} href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noopener noreferrer">Crear una en WhatsApp</a>
          </p>
        ) : (
          <div className={s.tiles}>
            {list.map(t => (
              <TemplateTile key={keyOf(t)} t={t} selected={keyOf(t) === tplKey} langTag={sameName(t)}
                name={firstNameOf(chosen[0]?.name)} onPick={() => chooseTemplate(t)} />
            ))}
          </div>
        )}
      </div>
    )
  } else {
    body = template && (
      <div className={s.duo}>
        <div className={s.l}>
          <div aria-live="polite">
            {blanks.length > 0 && (missing.length
              ? <p className={`${s.note} ${miss ? s.bad : s.wn}`}>{miss ? <AlertCircle aria-hidden="true" /> : <PenLine aria-hidden="true" />}<span>{miss ? (missing.length === 1 ? 'Falta llenar un dato.' : `Faltan ${missing.length} datos por llenar.`) : 'Escribe en lo amarillo.'}</span></p>
              : <p className={`${s.note} ${s.ok}`}><Check aria-hidden="true" /><span>Mensaje completo.</span></p>)}
          </div>
          <Chat store={status?.health?.verifiedName || store}>
            <Bubble template={template} mode="fill" personalize={personalize} name={firstNameOf(chosen[0]?.name)}
              values={values} onValue={(v, text) => setValues(p => ({ ...p, [v]: text }))} missing={miss ? new Set(missing) : undefined}
              image={{ url: image.url, busy: image.busy, error: !!image.error, onFile: f => void uploadImage(f) }} />
          </Chat>
          {image.error && <p className={`${s.note} ${s.bad}`}><AlertCircle aria-hidden="true" /><span>{image.error}</span></p>}
          {hasFirst && (
            <p className={s.note}>
              <span>
                {personalize ? 'Lo azul es el nombre de cada cliente. ' : 'El primer dato lo escribes tú. '}
                <button type="button" className={s.lk} onClick={() => setNameMode(!personalize)}>{personalize ? 'Prefiero escribirlo' : 'Usar el nombre de cada cliente'}</button>
              </span>
            </p>
          )}
        </div>
        <div className={s.r}>
          <h2 className={s.tt} ref={title} tabIndex={-1}>Revisa y envía</h2>
          <div className={s.sm}>
            <div className={s.sr}>
              <span className={s.k}>Para</span>
              <span className={s.v}>{everyone ? ALL_CLIENTS : fullNames(chosenGroups) || '—'}<small>{pl(n, 'persona', 'personas')}</small></span>
              <button type="button" className={s.lk} onClick={() => go('who')}>Cambiar</button>
            </div>
            <div className={s.sr}>
              <span className={s.k}>Plantilla</span>
              <span className={s.v}>{templateTitle(template.name)}</span>
              <button type="button" className={s.lk} onClick={() => go('tpl')}>Cambiar</button>
            </div>
            {status?.health?.displayPhoneNumber && (
              <div className={s.sr}>
                <span className={s.k}>Sale de</span>
                <span className={s.v}>{status.health.displayPhoneNumber}<small>{status.health.verifiedName || store}</small></span>
                <span />
              </div>
            )}
          </div>
          {template.quality === 'RED' && (
            <p className={`${s.note} ${s.wn}`}><AlertCircle aria-hidden="true" /><span>WhatsApp califica esta plantilla con calidad baja: si siguen los bloqueos o reportes, puede pausarla.</span></p>
          )}
          {later.length > 0 && today.length > 0 && (
            <p className={`${s.note} ${s.wn}`}><Clock aria-hidden="true" /><span>WhatsApp te deja escribirle a {pl(today.length, 'persona', 'personas')} hoy. Las otras {fmt(later.length)} quedan para mañana.</span></p>
          )}
          {!today.length && n > 0 && (
            <p className={`${s.note} ${s.bad}`}><AlertCircle aria-hidden="true" /><span>{left === 0 ? 'Hoy ya llegaste al límite de WhatsApp. Podrás enviarla mañana.' : 'Ninguna de estas personas puede recibirla ahora.'}</span></p>
          )}
          {outTotal > 0 && (
            <p className={s.note}><Users aria-hidden="true" /><span>
              {why
                ? `Fuera de la cuenta: ${(Object.entries(outs) as [OutReason, number][]).filter(([, k]) => k).map(([k, c]) => `${fmt(c)} ${OUT_WHY[k][c === 1 ? 0 : 1]}`).join(', ')}.`
                : <>{outTotal === 1 ? 'Otra persona no puede recibirla.' : `Otras ${fmt(outTotal)} no pueden recibirla.`} <button type="button" className={s.lk} onClick={() => setWhy(true)}>Ver por qué</button></>}
            </span></p>
          )}
          <div className={s.act}>
            <button type="button" className={`btn btn-primary ${s.big} ${s.press}`} disabled={!today.length || quota?.canSendMessage === 'BLOCKED'} onClick={ask}>
              <Send aria-hidden="true" /> Enviar a {pl(today.length, 'persona', 'personas')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return portal(
    <div className={s.wiz} role="dialog" aria-modal="true" aria-label="Nueva campaña">
      <header className={s.wh}>
        {idx > 1 ? (
          <button type="button" className={s.bk} onClick={() => go(step === 'send' ? 'tpl' : 'who')}><ArrowLeft aria-hidden="true" /><span className={s.lb}>Atrás</span></button>
        ) : <span />}
        <div>
          <ol className={s.steps}>
            {STEPS.map((name, i) => i + 1 < idx
              ? <li key={name}><button type="button" onClick={() => go(i === 0 ? 'who' : 'tpl')}><Check aria-hidden="true" />{name}</button></li>
              : <li key={name} className={i + 1 === idx ? s.now : undefined} aria-current={i + 1 === idx ? 'step' : undefined}>{name}</li>)}
          </ol>
          <div className={s.stx}>Paso {idx} de {STEPS.length}</div>
        </div>
        <button type="button" className={s.cl} onClick={onClose}><span className={s.lb}>Salir</span><X aria-hidden="true" /></button>
        <i className={s.pg} style={{ width: `${(idx / STEPS.length) * 100}%` }} />
      </header>
      <div className={s.wb} ref={scroller}>{body}</div>
      <ConfirmDialog open={confirm} tone="warn" icon={Send} title={`¿Enviar a ${pl(today.length, 'persona', 'personas')}?`}
        confirmLabel="Enviar" onConfirm={() => void run()} onCancel={() => setConfirm(false)}>
        El mensaje sale en este momento y no se puede deshacer.
      </ConfirmDialog>
    </div>,
  )
}

function portal(node: React.ReactNode) {
  return typeof document === 'undefined' ? null : createPortal(node, document.body)
}

/** Casilla de un grupo: marcada, a medias (parte del grupo) o vacía. */
function GroupRow({ id, label, dot, k, total, onChange }: {
  id: string; label: string; dot?: string; k: number; total: number; onChange: (on: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const some = k > 0 && k < total
  useEffect(() => { if (ref.current) ref.current.indeterminate = some }, [some])
  return (
    <label className={s.row} htmlFor={`grupo-${id}`}>
      <input ref={ref} id={`grupo-${id}`} type="checkbox" checked={k === total && total > 0} onChange={e => onChange(some ? true : e.target.checked)} />
      {dot && <span className={s.dot} style={{ background: dot }} />}
      <span className={s.g}>{label}</span>
      <span className={s.n}>{some ? `${fmt(k)} de ` : ''}{fmt(total)}</span>
    </label>
  )
}

/** Una plantilla tal como llega (con su foto guardada, si tiene). */
function TemplateTile({ t, selected, langTag, name, onPick }: {
  t: WhatsAppTemplateDef; selected: boolean; langTag: boolean; name: string; onPick: () => void
}) {
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    if (!t.hasImageHeader) return
    let alive = true
    apiFetch(`/api/whatsapp/template-image?template=${encodeURIComponent(t.name)}`).then(r => r.json())
      .then(d => { if (alive) setImg(d.url || null) }).catch(() => {})
    return () => { alive = false }
  }, [t.name, t.hasImageHeader])
  const personalize = variablesOf(t.bodyPreview).includes(0) && looksLikeName(t.bodyPreview)
  return (
    <button type="button" className={`${s.tile} ${selected ? s.sel : ''}`} disabled={!!t.unsupported} onClick={onPick} aria-pressed={selected}>
      <span className={s.hd}>{templateTitle(t.name)}{langTag && <small>{t.language}</small>}</span>
      <span className={s.bx}><Bubble template={t} mode="sample" personalize={personalize} name={name} image={{ url: img }} /></span>
      {t.unsupported && <span className={s.why}>No se puede enviar desde aquí: {t.unsupported.toLowerCase()}.</span>}
    </button>
  )
}
