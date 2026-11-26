'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle, Bold, Braces, Check, CircleAlert, ExternalLink, FileText, ImagePlus, Italic, Megaphone, Phone, Plus,
  Reply, Send, Strikethrough, Type, UserRound, X,
} from 'lucide-react'
import { apiFetch } from '@/lib/apiClient'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Bubble, Chat } from '@/components/WhatsAppBubble'
import { templateTitle } from '@/lib/campaignWizard'
import {
  BAJA_FOOTER, BUTTON_KINDS, LANGUAGES, LIMITS, NAME_EXAMPLE, NAME_KEY, blockers, draftAsDef, draftFromTemplate,
  emptyDraft, issuesOf, nextDataKey, suggestName, tokensOf,
  type DraftButtonKind, type Issue, type TemplateCategory, type TemplateDraft,
} from '@/lib/templateBuilder'
import { templateState, type ManagedTemplate } from '@/lib/whatsappTemplates'
import { MODELS, type TemplateModel } from './models'
import { keyOf } from './ui'
import s from './plantillas.module.css'

export type EditorStart = { mode: 'new' } | { mode: 'edit'; template: ManagedTemplate } | { mode: 'copy'; template: ManagedTemplate }

const MAX_IMAGE = 4 * 1024 * 1024
const BUTTON_ICON: Record<DraftButtonKind, typeof Reply> = { reply: Reply, url: ExternalLink, call: Phone }
const FIELD_ID: Record<Issue['field'], string> = { name: 'sec-datos', header: 'sec-encabezado', body: 'sec-mensaje', examples: 'sec-mensaje', footer: 'sec-pie', buttons: 'sec-botones' }

/** Un nombre que no esté ocupado: «buen_fin», «buen_fin_2»… */
function freeName(base: string, language: string, taken: Set<string>): string {
  const root = base || 'mi_plantilla'
  let name = root, n = 2
  while (taken.has(`${name}|${language}`)) name = `${root}_${n++}`
  return name
}

/**
 * Crear, corregir o duplicar una plantilla, a pantalla completa: primero el
 * tipo y cómo empezar (solo al crear) y luego el formulario con la vista
 * previa y la lista de lo que falta. Al enviarla, WhatsApp la revisa.
 */
export function TemplateEditor({ start, templates, store, storePhone, onClose, onSaved }: {
  start: EditorStart
  templates: ManagedTemplate[]
  store: string
  /** Teléfono de la tienda para los botones de llamar. */
  storePhone: string
  onClose: () => void
  /** Se envió a revisión: name|language de la plantilla. */
  onSaved: (key: string) => void
}) {
  const editing = start.mode === 'edit' ? start.template : null
  const taken = useMemo(() => new Set(templates.filter(t => !editing || t.id !== editing.id).map(keyOf)), [templates, editing])

  const initial = useMemo<TemplateDraft>(() => {
    if (start.mode === 'new') return emptyDraft()
    const d = draftFromTemplate(start.template)
    if (start.mode === 'copy') d.name = freeName(`${d.name}_copia`.slice(0, 60), d.language, taken)
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [phase, setPhase] = useState<'start' | 'form'>(start.mode === 'new' ? 'start' : 'form')
  const [category, setCategory] = useState<TemplateCategory>('MARKETING')
  const [draft, setDraft] = useState<TemplateDraft>(initial)
  const [base, setBase] = useState(JSON.stringify(initial))
  const [nameTouched, setNameTouched] = useState(start.mode !== 'new')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [savedImage, setSavedImage] = useState<string | null>(null)
  const [imageError, setImageError] = useState('')
  const [tried, setTried] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [leave, setLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  // La foto que ya tenía (al corregir o duplicar una con foto)
  const source = start.mode === 'new' ? null : start.template
  useEffect(() => {
    if (!source?.hasImageHeader) return
    let alive = true
    apiFetch(`/api/whatsapp/template-image?template=${encodeURIComponent(source.name)}`).then(r => r.json())
      .then(d => { if (alive) setSavedImage(d.url || null) }).catch(() => {})
    return () => { alive = false }
  }, [source])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  // Sin scroll de la página detrás
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const set = (patch: Partial<TemplateDraft>) => setDraft(d => {
    const next = { ...d, ...patch }
    // Mientras no lo cambies, el nombre sale de las primeras palabras del mensaje
    if (!nameTouched && patch.body !== undefined && !editing) next.name = freeName(suggestName(next.body), next.language, taken)
    return next
  })

  const begin = (cat: TemplateCategory, model?: TemplateModel) => {
    const d: TemplateDraft = model
      ? { ...emptyDraft(cat), ...structuredClone(model.draft), language: 'es_MX', name: '' }
      : emptyDraft(cat)
    d.buttons = d.buttons.map(b => (b.kind === 'call' && !b.phone ? { ...b, phone: storePhone } : b))
    d.name = freeName(suggestName(model ? model.title : ''), d.language, taken)
    setDraft(d)
    setBase(JSON.stringify(d))
    // Con un modelo, el nombre sale de su título; en blanco, de las primeras palabras del mensaje
    setNameTouched(!!model)
    setPhase('form')
  }

  // Al corregir o duplicar, la foto que ya tenía sirve si no eliges otra
  const hasImage = !!file || (draft.header.kind === 'image' && !!savedImage && start.mode !== 'new')
  const issues = issuesOf(draft, { taken, hasImage, editing: !!editing })
  const stoppers = blockers(issues)
  const def = draftAsDef(draft)
  const dirty = phase === 'form' && (JSON.stringify(draft) !== base || !!file)
  const keys = tokensOf(draft.body)
  const flagged = new Set(tried ? stoppers.map(i => FIELD_ID[i.field]) : [])

  // ── Mensaje: formato y datos en el cursor ──
  const edit = (fn: (text: string, a: number, b: number) => { text: string; caret: [number, number] }) => {
    const el = area.current
    const a = el?.selectionStart ?? draft.body.length
    const b = el?.selectionEnd ?? draft.body.length
    const { text, caret } = fn(draft.body, a, b)
    set({ body: text })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(caret[0], caret[1]) })
  }
  const wrap = (mark: string) => edit((t, a, b) => {
    const inner = t.slice(a, b) || 'texto'
    return { text: `${t.slice(0, a)}${mark}${inner}${mark}${t.slice(b)}`, caret: [a + mark.length, a + mark.length + inner.length] }
  })
  const insert = (token: string) => edit((t, a, b) => {
    const before = t.slice(0, a), after = t.slice(b)
    const pad = before && !/\s$/.test(before) ? ' ' : ''
    const tail = after && !/^[\s.,;:!?]/.test(after) ? ' ' : ''
    const text = `${before}${pad}${token}${tail}${after}`
    const at = before.length + pad.length + token.length
    return { text, caret: [at, at] }
  })
  const removeToken = (key: string) => {
    const text = draft.body.replace(new RegExp(`\\s?\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), '')
    const { [key]: _, ...examples } = draft.examples
    set({ body: text, examples })
  }

  // ── Encabezado: foto ──
  const pickImage = (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(jpeg|png)$/.test(f.type)) { setImageError('Usa una foto JPG o PNG (son las que acepta WhatsApp).'); return }
    if (f.size > MAX_IMAGE) { setImageError('La foto pesa más de 4 MB. Usa una más ligera.'); return }
    setImageError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  // ── Botones ──
  const addButton = (kind: DraftButtonKind) => set({
    buttons: [...draft.buttons, kind === 'reply' ? { kind, text: '' } : kind === 'url' ? { kind, text: 'Visitar sitio web', url: 'https://' } : { kind, text: 'Llamar a la tienda', phone: storePhone }],
  })
  const setButton = (i: number, patch: Partial<TemplateDraft['buttons'][number]>) => set({ buttons: draft.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) })

  const goTo = (field: Issue['field']) => document.getElementById(FIELD_ID[field])?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  const ask = () => {
    setTried(true)
    if (stoppers.length) { goTo(stoppers[0].field); return }
    setError('')
    setConfirm(true)
  }
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('draft', JSON.stringify(draft))
      if (file && draft.header.kind === 'image') fd.append('image', file)
      if (editing) fd.append('id', editing.id)
      if (start.mode === 'copy' && !file) fd.append('from', start.template.name)
      const r = await apiFetch('/api/whatsapp/templates/manage', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'WhatsApp no aceptó la plantilla.')
      setConfirm(false)
      onSaved(`${d.name ?? draft.name}|${d.language ?? draft.language}`)
    } catch (e) {
      setError((e as Error).message || 'No se pudo enviar. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }
  const close = () => (dirty ? setLeave(true) : onClose())

  const title = editing ? `${templateState(editing.status) === 'rejected' ? 'Corregir' : 'Editar'} «${templateTitle(editing.name)}»`
    : start.mode === 'copy' ? 'Duplicar plantilla' : 'Nueva plantilla'

  // ── Pantallas ──
  let body: React.ReactNode
  if (phase === 'start') {
    body = (
      <div className={s.start}>
        <h3>¿Qué vas a mandar?</h3>
        <div className={s.types}>
          <button type="button" className={`${s.type} ${s.press}`} aria-pressed={category === 'MARKETING'} onClick={() => setCategory('MARKETING')}>
            <Megaphone aria-hidden="true" /><span><b>Una promoción</b><small>Descuentos, productos nuevos, invitaciones. WhatsApp la clasifica como Marketing.</small></span>
          </button>
          <button type="button" className={`${s.type} ${s.press}`} aria-pressed={category === 'UTILITY'} onClick={() => setCategory('UTILITY')}>
            <FileText aria-hidden="true" /><span><b>Un aviso</b><small>Pedidos, pagos, cotizaciones o visitas de un cliente. Sin ofertas: WhatsApp la clasifica como Utilidad.</small></span>
          </button>
        </div>
        <h3>¿Cómo empiezas?</h3>
        <div className={s.models}>
          <button type="button" className={`${s.model} ${s.blank} ${s.press}`} onClick={() => begin(category)}><b><Plus aria-hidden="true" />En blanco</b></button>
          {MODELS[category].map(m => (
            <button key={m.title} type="button" className={`${s.model} ${s.press}`} onClick={() => begin(category, m)}>
              <b>{m.title}</b>
              <span>{m.draft.body.replace(/\{\{nombre\}\}/g, NAME_EXAMPLE).replace(/\{\{(\w+)\}\}/g, (_, k: string) => m.draft.examples[k] ?? k)}</span>
            </button>
          ))}
        </div>
      </div>
    )
  } else {
    const count = (n: number, max: number) => <span className={n > max ? s.over : undefined}>{n.toLocaleString('es-MX')}/{max.toLocaleString('es-MX')}</span>
    const approved = editing && templateState(editing.status) === 'ok'
    body = (
      <div className={s.grid}>
        <div className={s.form}>
          <section id="sec-datos" className={`${s.sec} ${flagged.has('sec-datos') ? s.flag : ''}`}>
            <h3>Datos</h3>
            <div className={s.f}>
              <label htmlFor="tpl-nombre">Nombre de la plantilla</label>
              <input id="tpl-nombre" value={draft.name} disabled={!!editing} maxLength={LIMITS.name} autoComplete="off" spellCheck={false}
                onChange={e => { setNameTouched(true); set({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }) }} />
              <span className={s.hint}><span>{editing ? 'El nombre no cambia al corregirla.' : 'Solo para ti: tus clientes no lo ven. Minúsculas, números y guion bajo.'}</span></span>
            </div>
            <div className={s.two}>
              <div className={s.f}>
                <span id="tpl-tipo">Tipo</span>
                <div className={s.seg} role="group" aria-labelledby="tpl-tipo">
                  {(['MARKETING', 'UTILITY'] as const).map(c => (
                    <button key={c} type="button" aria-pressed={draft.category === c} disabled={!!approved}
                      onClick={() => set({ category: c, footer: c === 'MARKETING' && !draft.footer.trim() ? BAJA_FOOTER : draft.footer })}>
                      {c === 'MARKETING' ? 'Promoción' : 'Aviso'}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.f}>
                <label htmlFor="tpl-idioma">Idioma</label>
                <select id="tpl-idioma" value={draft.language} disabled={!!editing} onChange={e => set({ language: e.target.value })}>
                  {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </div>
            </div>
          </section>

          <section id="sec-encabezado" className={`${s.sec} ${flagged.has('sec-encabezado') ? s.flag : ''}`}>
            <h3>Encabezado <small>opcional</small></h3>
            <p>Va arriba del mensaje: un título corto o una foto.</p>
            <div className={s.seg} role="group" aria-label="Encabezado">
              {([['none', 'Ninguno', null], ['text', 'Texto', Type], ['image', 'Foto', ImagePlus]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" aria-pressed={draft.header.kind === k} onClick={() => set({ header: { ...draft.header, kind: k } })}>
                  {Icon && <Icon aria-hidden="true" />}{label}
                </button>
              ))}
            </div>
            {draft.header.kind === 'text' && (
              <div className={s.f}>
                <label htmlFor="tpl-encabezado">Texto del encabezado</label>
                <input id="tpl-encabezado" value={draft.header.text} maxLength={LIMITS.header + 20} onChange={e => set({ header: { kind: 'text', text: e.target.value } })} />
                <span className={s.hint}><span>Sin emojis ni formato.</span>{count(draft.header.text.trim().length, LIMITS.header)}</span>
              </div>
            )}
            {draft.header.kind === 'image' && (
              <div className={s.photo}>
                {(preview || savedImage) && <img src={preview ?? savedImage ?? ''} alt="Foto del encabezado" />}
                <label className={`btn btn-ghost ${s.press}`}>
                  <ImagePlus aria-hidden="true" /> {preview || savedImage ? 'Cambiar foto' : 'Elegir foto'}
                  <input type="file" accept="image/jpeg,image/png" onChange={e => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <span className={s.mut}>JPG o PNG, hasta 4 MB. WhatsApp la usa de ejemplo y Campañas la pone sola.</span>
              </div>
            )}
            {imageError && <p className={s.mut} style={{ color: 'var(--danger)', marginTop: 8 }}>{imageError}</p>}
          </section>

          <section id="sec-mensaje" className={`${s.sec} ${flagged.has('sec-mensaje') ? s.flag : ''}`}>
            <h3>Mensaje</h3>
            <p>Lo azul se llena solo con el nombre de cada cliente; lo amarillo lo escribes al mandar la campaña.</p>
            <div className={s.tools}>
              <button type="button" className={s.tool} onClick={() => wrap('*')} aria-label="Negrita" title="Negrita"><Bold aria-hidden="true" /></button>
              <button type="button" className={s.tool} onClick={() => wrap('_')} aria-label="Cursiva" title="Cursiva"><Italic aria-hidden="true" /></button>
              <button type="button" className={s.tool} onClick={() => wrap('~')} aria-label="Tachado" title="Tachado"><Strikethrough aria-hidden="true" /></button>
              <span className={s.sep} aria-hidden="true" />
              <button type="button" className={`${s.tool} ${s.add}`} disabled={keys.includes(NAME_KEY)} onClick={() => insert(`{{${NAME_KEY}}}`)}><UserRound aria-hidden="true" />Nombre del cliente</button>
              <button type="button" className={`${s.tool} ${s.add}`} onClick={() => insert(`{{${nextDataKey(draft.body)}}}`)}><Braces aria-hidden="true" />Dato que cambia</button>
            </div>
            <div className={s.f} style={{ marginTop: 0 }}>
              <textarea id="tpl-mensaje" ref={area} value={draft.body} aria-label="Mensaje" maxLength={LIMITS.body + 200}
                placeholder="Hola {{nombre}}, …" onChange={e => set({ body: e.target.value })} />
              <span className={s.hint}><span>Puedes escribir *negrita*, _cursiva_ y ~tachado~.</span>{count(draft.body.trim().length, LIMITS.body)}</span>
            </div>
            {keys.length > 0 && (
              <div className={s.vars}>
                {keys.map(k => (
                  <div key={k} className={s.var}>
                    <code className={k === NAME_KEY ? s.nm : undefined}>{`{{${k}}}`}</code>
                    {k === NAME_KEY
                      ? <span className={s.auto}>El primer nombre de cada cliente (ejemplo para WhatsApp: {NAME_EXAMPLE})</span>
                      : <input value={draft.examples[k] ?? ''} maxLength={LIMITS.example} placeholder="Ejemplo: 20 %, sábado 28, P-2041…" aria-label={`Ejemplo para ${k}`}
                        onChange={e => set({ examples: { ...draft.examples, [k]: e.target.value } })} />}
                    <button type="button" className={s.rm} onClick={() => removeToken(k)} aria-label={`Quitar ${k} del mensaje`} title="Quitar del mensaje"><X aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="sec-pie" className={`${s.sec} ${flagged.has('sec-pie') ? s.flag : ''}`}>
            <h3>Pie <small>opcional</small></h3>
            <div className={s.f} style={{ marginTop: 6 }}>
              <input id="tpl-pie" value={draft.footer} maxLength={LIMITS.footer + 20} aria-label="Pie del mensaje" onChange={e => set({ footer: e.target.value })} placeholder="Texto pequeño al final" />
              <span className={s.hint}>
                <span>{draft.category === 'MARKETING' && !/\bbaja\b/i.test(draft.footer)
                  ? <button type="button" className={s.lk} style={{ minHeight: 0, fontSize: 12 }} onClick={() => set({ footer: BAJA_FOOTER })}>Usar «{BAJA_FOOTER}»</button>
                  : 'Texto gris, más pequeño.'}</span>
                {count(draft.footer.trim().length, LIMITS.footer)}
              </span>
            </div>
          </section>

          <section id="sec-botones" className={`${s.sec} ${flagged.has('sec-botones') ? s.flag : ''}`}>
            <h3>Botones <small>opcional, hasta {LIMITS.buttons}</small></h3>
            <p>Respuestas rápidas que el cliente toca para contestarte, o botones para abrir tu sitio web o llamarte.</p>
            {draft.buttons.map((b, i) => {
              const Icon = BUTTON_ICON[b.kind]
              return (
                <div key={i} className={s.btnRow}>
                  <span className={s.kind}><Icon aria-hidden="true" />{BUTTON_KINDS[b.kind].label}</span>
                  <span className={s.fields}>
                    <input value={b.text} maxLength={LIMITS.button + 10} placeholder="Texto del botón" aria-label={`Texto del botón ${i + 1}`} onChange={e => setButton(i, { text: e.target.value })} />
                    {b.kind === 'url' && <input value={b.url ?? ''} inputMode="url" placeholder="https://tusitio.com" aria-label={`Dirección del botón ${i + 1}`} onChange={e => setButton(i, { url: e.target.value })} />}
                    {b.kind === 'call' && <input value={b.phone ?? ''} inputMode="tel" placeholder="Teléfono a 10 dígitos" aria-label={`Teléfono del botón ${i + 1}`} onChange={e => setButton(i, { phone: e.target.value })} />}
                  </span>
                  <button type="button" className={s.rm} onClick={() => set({ buttons: draft.buttons.filter((_, j) => j !== i) })} aria-label={`Quitar el botón ${i + 1}`}><X aria-hidden="true" /></button>
                </div>
              )
            })}
            <div className={s.addBtn}>
              {(Object.keys(BUTTON_KINDS) as DraftButtonKind[]).map(k => {
                const Icon = BUTTON_ICON[k]
                const full = draft.buttons.length >= LIMITS.buttons || draft.buttons.filter(b => b.kind === k).length >= BUTTON_KINDS[k].max
                return <button key={k} type="button" className={`btn btn-ghost ${s.press}`} disabled={full} onClick={() => addButton(k)}><Icon aria-hidden="true" /> {BUTTON_KINDS[k].label}</button>
              })}
            </div>
          </section>
        </div>

        <aside className={s.side}>
          <p className={s.prevHead}>Así le llega</p>
          <Chat store={store}>
            <Bubble template={def} mode="sample" personalize={!!def.clientName} name={NAME_EXAMPLE} image={{ url: preview ?? savedImage }} />
          </Chat>
          <div className={s.check} aria-live="polite">
            <h3>Antes de enviar</h3>
            <ul>
              {!issues.length && <li className={s.ok}><Check aria-hidden="true" /><span>Lista para enviar a revisión.</span></li>}
              {issues.map((i, n) => (
                <li key={n} className={i.warn ? s.warn : s.bad}>
                  {i.warn ? <CircleAlert aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
                  <button type="button" onClick={() => goTo(i.field)}>{i.text}</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    )
  }

  return createPortal(
    <div className={s.ed} role="dialog" aria-modal="true" aria-label={title}>
      <header className={s.bar}>
        <button type="button" className={s.x} onClick={close} aria-label="Salir"><X aria-hidden="true" /></button>
        <h2>{title}</h2>
        {phase === 'form' && (
          <button type="button" className={`btn btn-primary ${s.press}`} onClick={ask}><Send aria-hidden="true" /> Enviar a revisión</button>
        )}
      </header>
      <div className={s.eb}>{body}</div>

      <ConfirmDialog open={confirm} tone="warn" icon={Send} title="¿Enviar a revisión?" confirmLabel="Enviar a revisión" busyLabel="Enviando…" busy={busy} error={error}
        onConfirm={() => void submit()} onCancel={() => setConfirm(false)}>
        {editing && templateState(editing.status) === 'ok'
          ? 'Vuelve a revisión y no se podrá usar hasta que WhatsApp la apruebe (normalmente en minutos, hasta 24 horas).'
          : 'WhatsApp la revisa en minutos, a veces hasta 24 horas. Cuando la apruebe, podrás usarla en tus campañas.'}
      </ConfirmDialog>
      <ConfirmDialog open={leave} title="¿Salir sin enviar?" confirmLabel="Salir" cancelLabel="Seguir editando"
        onConfirm={() => { setLeave(false); onClose() }} onCancel={() => setLeave(false)}>
        Se pierde lo que escribiste en esta plantilla.
      </ConfirmDialog>
    </div>,
    document.body,
  )
}
