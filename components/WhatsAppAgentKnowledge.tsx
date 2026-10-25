'use client'

import { useRef, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { WaIcon } from '@/components/WhatsAppUI'
import {
  FILE_EXTENSIONS, MAX_ANSWER, MAX_BUSINESS_TEXT, MAX_FILE_BYTES, MAX_QUESTION, MAX_SKILL_DO, MAX_SKILL_NAME, MAX_SKILL_WHEN,
  SKILL_PRESETS, SKILL_STATUS_LABELS, fileExtension,
  type BusinessInfo, type Faq, type KnowledgeFile, type Skill, type Website,
} from '@/lib/agentKnowledge'

type Toast = (m: string) => void

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: any }> {
  try {
    const r = await apiFetch(url, init)
    return { ok: r.ok, data: await r.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: 'Sin conexión. Intenta de nuevo.' } }
  }
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/* ── Información de tu tienda ──────────────────────────────────────────── */
const INFO_FIELDS: { key: keyof BusinessInfo; label: string; placeholder: string; long?: boolean }[] = [
  { key: 'description', label: '¿Qué es tu tienda y qué vendes?', long: true, placeholder: 'Tienda de pinturas. Vendemos pintura vinílica, esmaltes, impermeabilizantes y accesorios. Igualamos colores al momento.' },
  { key: 'payment', label: 'Formas de pago', placeholder: 'Efectivo, tarjeta de débito y crédito, transferencia.' },
  { key: 'purchase', label: 'Cómo comprar', placeholder: 'Pide por WhatsApp o ven a la tienda. Apartamos tu pedido 24 h.' },
  { key: 'delivery', label: 'Entregas y envíos', placeholder: 'Entrega a domicilio en la zona, gratis desde $1,500.' },
  { key: 'returns', label: 'Cambios y devoluciones', placeholder: 'Producto cerrado, con ticket, dentro de 7 días. Colores igualados no tienen cambio.' },
]

export function StoreInfoForm({ info, onSaved, toast }: { info: BusinessInfo | null; onSaved: (i: BusinessInfo) => void; toast: Toast }) {
  const [form, setForm] = useState<BusinessInfo | null>(info)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!info || !form) {
    return (
      <div>
        <h2 className="ag-title">Información de tu tienda</h2>
        <p className="ag-hint">Podrás editarla en cuanto Meta la regrese.</p>
      </div>
    )
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(info)
  const set = (k: keyof BusinessInfo, v: string) => setForm({ ...form, [k]: v })

  async function save() {
    setSaving(true); setError('')
    const { ok, data } = await call('/api/whatsapp/agent/business-info', json('PUT', form))
    setSaving(false)
    if (!ok) return setError(data.error || 'No se pudo guardar')
    onSaved(data.businessInfo ?? form!)
    toast('Información guardada')
  }

  return (
    <div>
      <h2 className="ag-title">Información de tu tienda</h2>
      <p className="ag-lead">La IA usa esto para contestar lo básico. Escríbelo como se lo explicarías a un cliente.</p>
      {INFO_FIELDS.map(f => (
        <div className="field" key={f.key}>
          <label htmlFor={`ag-info-${f.key}`}>{f.label}</label>
          <textarea id={`ag-info-${f.key}`} rows={f.long ? 4 : 2} maxLength={MAX_BUSINESS_TEXT} value={form[f.key]} placeholder={f.placeholder}
            onChange={e => set(f.key, e.target.value)} />
        </div>
      ))}
      <div className="ag-section">
        <h3 className="ag-h3">Contacto y ubicación</h3>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ag-info-hours">Horario</label>
            <input id="ag-info-hours" maxLength={MAX_BUSINESS_TEXT} value={form.hours} placeholder="Lun a sáb de 9:00 a 19:00" onChange={e => set('hours', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ag-info-email">Correo</label>
            <input id="ag-info-email" type="email" maxLength={254} value={form.email} placeholder="ventas@tutienda.mx" onChange={e => set('email', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ag-info-address">Dirección</label>
          <input id="ag-info-address" maxLength={MAX_BUSINESS_TEXT} value={form.address} placeholder="Calle, número, colonia y ciudad" onChange={e => set('address', e.target.value)} />
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="ag-actions">
        <button className="btn btn-ghost" onClick={() => { setForm(info); setError('') }} disabled={!dirty || saving}>Descartar</button>
        <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

/* ── Conocimientos: preguntas frecuentes, archivos y página web ────────── */
type KnowledgeTab = 'faqs' | 'files' | 'web'

export function Knowledge({ faqs, files, websites, onFaqs, onFiles, onWebsites, toast }: {
  faqs: Faq[]; files: KnowledgeFile[]; websites: Website[]
  onFaqs: (l: Faq[]) => void; onFiles: (l: KnowledgeFile[]) => void; onWebsites: (l: Website[]) => void; toast: Toast
}) {
  const [tab, setTab] = useState<KnowledgeTab>('faqs')
  const tabs: [KnowledgeTab, string, number][] = [['faqs', 'Preguntas frecuentes', faqs.length], ['files', 'Archivos', files.length], ['web', 'Página web', websites.length]]
  return (
    <div>
      <h2 className="ag-title">Conocimientos</h2>
      <p className="ag-lead">Lo que la IA consulta para contestar preguntas más específicas.</p>
      <div className="ag-subtabs" role="tablist" aria-label="Conocimientos">
        {tabs.map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`ag-subtab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label} <span className="ag-subtab-n">· {n}</span>
          </button>
        ))}
      </div>
      {tab === 'faqs' && <Faqs list={faqs} onChange={onFaqs} toast={toast} />}
      {tab === 'files' && <Files list={files} onChange={onFiles} toast={toast} />}
      {tab === 'web' && <Websites list={websites} onChange={onWebsites} toast={toast} />}
    </div>
  )
}

function Faqs({ list, onChange, toast }: { list: Faq[]; onChange: (l: Faq[]) => void; toast: Toast }) {
  // null: cerrado · 'new': nueva · id: editando esa
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function save(id: string | null, question: string, answer: string) {
    setBusy(id ?? 'new'); setError('')
    const { ok, data } = await call(id ? `/api/whatsapp/agent/faqs?id=${encodeURIComponent(id)}` : '/api/whatsapp/agent/faqs', json(id ? 'PUT' : 'POST', { question, answer }))
    setBusy(null)
    if (!ok) { setError(data.error || 'No se pudo guardar'); return false }
    onChange(id ? list.map(f => (f.id === id ? data.faq : f)) : [data.faq, ...list])
    setEditing(null)
    toast(id ? 'Pregunta actualizada' : 'Pregunta agregada')
    return true
  }

  async function remove(f: Faq) {
    setBusy(f.id); setError('')
    const { ok, data } = await call(`/api/whatsapp/agent/faqs?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo borrar')
    onChange(list.filter(x => x.id !== f.id)); toast('Pregunta borrada')
  }

  return (
    <div>
      <div className="ag-row-head">
        <p className="ag-hint">Una pregunta por tema, como la escribiría un cliente.</p>
        {editing !== 'new' && <button className="btn btn-dark" onClick={() => { setEditing('new'); setError('') }}>+ Nueva pregunta</button>}
      </div>
      {editing === 'new' && <FaqForm busy={busy === 'new'} onCancel={() => setEditing(null)} onSave={(q, a) => save(null, q, a)} />}
      {error && <p className="field-error" role="alert">{error}</p>}
      {list.length === 0 && editing !== 'new' ? (
        <p className="ag-hint">Aún no hay preguntas. Empieza por las que más te hacen: cuánto rinde una cubeta, si igualan colores, si dan factura.</p>
      ) : (
        <ul className="ag-list">
          {list.map(f => editing === f.id ? (
            <li key={f.id} className="ag-li-form"><FaqForm initial={f} busy={busy === f.id} onCancel={() => setEditing(null)} onSave={(q, a) => save(f.id, q, a)} /></li>
          ) : (
            <li key={f.id}>
              <span className="ag-list-main"><strong>{f.question}</strong><small className="ag-pre">{f.answer}</small></span>
              <span className="ag-li-act">
                <button className="btn-icon" onClick={() => { setEditing(f.id); setError('') }} aria-label={`Editar «${f.question}»`} title="Editar"><EditIcon /></button>
                <button className="btn-icon" onClick={() => remove(f)} disabled={busy === f.id} aria-label={`Borrar «${f.question}»`} title="Borrar"><WaIcon.close size={16} /></button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FaqForm({ initial, busy, onCancel, onSave }: { initial?: Faq; busy: boolean; onCancel: () => void; onSave: (q: string, a: string) => Promise<boolean> }) {
  const [question, setQuestion] = useState(initial?.question ?? '')
  const [answer, setAnswer] = useState(initial?.answer ?? '')
  return (
    <form className="ag-form" onSubmit={e => { e.preventDefault(); onSave(question, answer) }}>
      <div className="field">
        <label htmlFor="ag-faq-q">Pregunta</label>
        <input id="ag-faq-q" autoFocus maxLength={MAX_QUESTION} value={question} placeholder="¿Cuánto rinde una cubeta de vinílica?" onChange={e => setQuestion(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ag-faq-a">Respuesta</label>
        <textarea id="ag-faq-a" rows={3} maxLength={MAX_ANSWER} value={answer} placeholder="Una cubeta de 19 L rinde de 80 a 100 m² a una mano, según la superficie." onChange={e => setAnswer(e.target.value)} />
      </div>
      <div className="ag-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy || !question.trim() || !answer.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function Files({ list, onChange, toast }: { list: KnowledgeFile[]; onChange: (l: KnowledgeFile[]) => void; toast: Toast }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    setError('')
    if (!(FILE_EXTENSIONS as readonly string[]).includes(fileExtension(file.name))) return setError('Sube un PDF, Word (.doc o .docx) o una imagen (.png o .jpg)')
    if (file.size > MAX_FILE_BYTES) return setError('El archivo pesa más de 4 MB. Divídelo o comprímelo.')
    setBusy('upload')
    const form = new FormData()
    form.append('file', file)
    const { ok, data } = await call('/api/whatsapp/agent/files', { method: 'POST', body: form })
    setBusy(null)
    if (input.current) input.current.value = ''
    if (!ok) return setError(data.error || 'No se pudo subir')
    onChange([data.file, ...list]); toast('Archivo agregado')
  }

  async function remove(f: KnowledgeFile) {
    setBusy(f.id); setError('')
    const { ok, data } = await call(`/api/whatsapp/agent/files?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo borrar')
    onChange(list.filter(x => x.id !== f.id)); toast('Archivo borrado')
  }

  return (
    <div>
      <label className={`ag-drop ${over ? 'over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]) }}>
        <input ref={input} type="file" accept={FILE_EXTENSIONS.map(x => `.${x}`).join(',')} disabled={busy === 'upload'}
          onChange={e => upload(e.target.files?.[0])} />
        <strong>{busy === 'upload' ? 'Subiendo…' : 'Sube un archivo o arrástralo aquí'}</strong>
        <span>PDF, Word o imagen · hasta 4 MB · por ejemplo tu lista de precios o fichas técnicas</span>
      </label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {list.length > 0 && (
        <ul className="ag-list">
          {list.map(f => (
            <li key={f.id}>
              <span className="ag-list-main"><strong>📄 {f.name}</strong></span>
              <button className="btn-icon" onClick={() => remove(f)} disabled={busy === f.id} aria-label={`Borrar ${f.name}`} title="Borrar"><WaIcon.close size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const WEB_STATUS: Record<Website['status'], string> = {
  not_started: 'En espera', pending: 'En espera', in_progress: 'Leyendo…', completed: 'Lista', completed_no_data: 'Sin contenido útil', failed: 'No se pudo leer',
}
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

function Websites({ list, onChange, toast }: { list: Website[]; onChange: (l: Website[]) => void; toast: Toast }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const reading = list.some(w => w.status === 'not_started' || w.status === 'pending' || w.status === 'in_progress')

  async function add() {
    setBusy('add'); setError('')
    const { ok, data } = await call('/api/whatsapp/agent/websites', json('POST', { url }))
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo agregar')
    onChange([data.website, ...list]); setUrl(''); toast('Página agregada. Meta la está leyendo.')
  }

  async function refresh() {
    setBusy('refresh'); setError('')
    const { ok, data } = await call('/api/whatsapp/agent/websites')
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo actualizar')
    onChange(data.websites)
  }

  async function remove(w: Website) {
    setBusy(w.id); setError('')
    const { ok, data } = await call(`/api/whatsapp/agent/websites?id=${encodeURIComponent(w.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo quitar')
    onChange(list.filter(x => x.id !== w.id)); toast('Página quitada')
  }

  return (
    <div>
      <p className="ag-hint">Meta lee tu página y la IA usa lo que encuentre. Tarda de unos minutos a unas horas.</p>
      <form className="ag-inline" onSubmit={e => { e.preventDefault(); add() }}>
        <input value={url} inputMode="url" placeholder="tutienda.mx" aria-label="Dirección de tu página" onChange={e => setUrl(e.target.value)} />
        <button className="btn btn-dark" disabled={!url.trim() || busy === 'add'}>{busy === 'add' ? 'Agregando…' : 'Agregar'}</button>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
      {list.length > 0 && (
        <ul className="ag-list">
          {list.map(w => (
            <li key={w.id}>
              <span className="ag-list-main">
                <strong>{w.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</strong>
                <small>
                  {WEB_STATUS[w.status]}
                  {w.status === 'completed' && w.pages > 0 && ` · ${w.pages} ${w.pages === 1 ? 'página' : 'páginas'}`}
                  {w.lastCrawledAt && ` · actualizada el ${fmtDay(w.lastCrawledAt)}`}
                  {w.status === 'failed' && w.error && ` · ${w.error}`}
                </small>
              </span>
              <button className="btn-icon" onClick={() => remove(w)} disabled={busy === w.id} aria-label={`Quitar ${w.url}`} title="Quitar"><WaIcon.close size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {reading && <button className="btn btn-ghost" onClick={refresh} disabled={busy === 'refresh'}>{busy === 'refresh' ? 'Revisando…' : 'Revisar si ya terminó'}</button>}
    </div>
  )
}

/* ── Reglas ────────────────────────────────────────────────────────────── */
export function Rules({ list, agentId, onChange, toast }: { list: Skill[]; agentId: string | null; onChange: (l: Skill[]) => void; toast: Toast }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const presetTitles = new Set<string>(SKILL_PRESETS.map(p => p.title))
  const own = list.filter(s => !presetTitles.has(s.title))

  async function save(id: string | null, rule: { name: string; description: string; skill: string }) {
    setBusy(id ?? 'new'); setError('')
    const { ok, data } = await call(id ? `/api/whatsapp/agent/skills?id=${encodeURIComponent(id)}` : '/api/whatsapp/agent/skills', json(id ? 'PUT' : 'POST', { ...rule, agentId }))
    setBusy(null)
    if (!ok) { setError(data.error || 'No se pudo guardar'); return false }
    onChange(id ? list.map(s => (s.id === id ? data.skill : s)) : [...list, data.skill])
    setEditing(null)
    toast('Regla guardada. Meta la revisa en unos minutos.')
    return true
  }

  async function remove(s: Skill) {
    setBusy(s.id); setError('')
    const { ok, data } = await call(`/api/whatsapp/agent/skills?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!ok) { setError(data.error || 'No se pudo borrar'); return false }
    onChange(list.filter(x => x.id !== s.id))
    return true
  }

  async function togglePreset(p: typeof SKILL_PRESETS[number]) {
    const current = list.find(s => s.title === p.title)
    if (current) { if (await remove(current)) toast(`«${p.name}» apagada`) }
    else await save(null, { name: p.title, description: p.description, skill: p.skill })
  }

  return (
    <div>
      <h2 className="ag-title">Reglas</h2>
      <p className="ag-lead">Instrucciones para situaciones concretas. Meta revisa cada regla antes de que la IA la use (unos minutos).</p>

      {SKILL_PRESETS.map(p => {
        const current = list.find(s => s.title === p.title)
        return (
          <div key={p.title} className="ag-preset">
            <span className="ag-nav-ico" aria-hidden="true">{p.icon}</span>
            <span className="ag-preset-text">
              <strong>{p.name}</strong><small>{p.hint}</small>
              {current && current.status !== 'active' && <StatusPill status={current.status} />}
            </span>
            <button role="switch" aria-checked={!!current} aria-label={p.name} className={`wa-switch ${current ? 'on' : ''}`}
              disabled={busy !== null} onClick={() => togglePreset(p)}><span /></button>
          </div>
        )
      })}

      <div className="ag-section">
        <div className="ag-row-head">
          <h3 className="ag-h3">Tus reglas</h3>
          {editing !== 'new' && <button className="btn btn-dark" onClick={() => { setEditing('new'); setError('') }}>+ Nueva regla</button>}
        </div>
        {editing === 'new' && <RuleForm busy={busy === 'new'} onCancel={() => setEditing(null)} onSave={r => save(null, r)} />}
        {error && <p className="field-error" role="alert">{error}</p>}
        {own.length === 0 && editing !== 'new' ? (
          <p className="ag-hint">Por ejemplo: «Cuando pidan más de 10 cubetas, pregunta los m² y la fecha, y pasa el chat al equipo».</p>
        ) : (
          <ul className="ag-list">
            {own.map(s => editing === s.id ? (
              <li key={s.id} className="ag-li-form"><RuleForm initial={s} busy={busy === s.id} onCancel={() => setEditing(null)} onSave={r => save(s.id, r)} /></li>
            ) : (
              <li key={s.id}>
                <span className="ag-list-main">
                  <strong>{s.name} <StatusPill status={s.status} /></strong>
                  <small><b>Aplica:</b> {s.description}</small>
                  <small className="ag-pre">{s.skill}</small>
                </span>
                <span className="ag-li-act">
                  <button className="btn-icon" onClick={() => { setEditing(s.id); setError('') }} aria-label={`Editar ${s.name}`} title="Editar"><EditIcon /></button>
                  <button className="btn-icon" onClick={() => remove(s).then(ok => { if (ok) toast('Regla borrada') })} disabled={busy === s.id} aria-label={`Borrar ${s.name}`} title="Borrar"><WaIcon.close size={16} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {own.some(s => s.status === 'blocked') && (
          <p className="ag-hint">«Rechazada»: Meta no la aprueba, casi siempre porque pide datos personales sensibles. Edítala para volver a enviarla.</p>
        )}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: Skill['status'] }) {
  const cls = status === 'active' ? 'ok' : status === 'blocked' ? 'blocked' : 'review'
  return <span className={`ag-pill ${cls}`}>{SKILL_STATUS_LABELS[status]}</span>
}

function RuleForm({ initial, busy, onCancel, onSave }: {
  initial?: Skill; busy: boolean; onCancel: () => void; onSave: (r: { name: string; description: string; skill: string }) => Promise<boolean>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [skill, setSkill] = useState(initial?.skill ?? '')
  return (
    <form className="ag-form" onSubmit={e => { e.preventDefault(); onSave({ name, description, skill }) }}>
      <div className="field">
        <label htmlFor="ag-rule-name">Nombre</label>
        <input id="ag-rule-name" autoFocus maxLength={MAX_SKILL_NAME} value={name} placeholder="Cotizaciones de obra" onChange={e => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ag-rule-when">¿Cuándo aplica? <span className="ag-count">{description.length}/{MAX_SKILL_WHEN}</span></label>
        <textarea id="ag-rule-when" rows={2} maxLength={MAX_SKILL_WHEN} value={description} placeholder="Cuando pidan más de 10 cubetas o pintura para una obra." onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ag-rule-do">¿Qué debe hacer la IA? <span className="ag-count">{skill.length}/{MAX_SKILL_DO}</span></label>
        <textarea id="ag-rule-do" rows={4} maxLength={MAX_SKILL_DO} value={skill}
          placeholder={'1. Pregunta los m² aproximados y el tipo de superficie.\n2. Pregunta para cuándo lo necesitan.\n3. Avisa que alguien del equipo enviará la cotización.'}
          onChange={e => setSkill(e.target.value)} />
      </div>
      <div className="ag-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy || !name.trim() || !description.trim() || !skill.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
