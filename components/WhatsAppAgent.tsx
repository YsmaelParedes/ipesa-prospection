'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { fmtPhone } from '@/lib/phone'
import { WaIcon } from '@/components/WhatsAppUI'
import type { AgentAudience, AgentSettings, HandoffSelection } from '@/lib/metaAgent'
import type { TestNumber } from '@/lib/agentTestNumbers'

type AgentState =
  | { state: 'ready'; settings: AgentSettings; testNumbers: TestNumber[]; testNumbersError: string | null }
  | { state: 'inactive' | 'not_eligible' }

type Section = 'ajustes' | 'prueba'

const INTERVALS: [number, string][] = [
  [300, '5 minutos'], [900, '15 minutos'], [1800, '30 minutos'], [3600, '1 hora'],
  [7200, '2 horas'], [28800, '8 horas'], [86400, '24 horas'],
]

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: any }> {
  try {
    const r = await apiFetch(url, init)
    return { ok: r.ok, data: await r.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: 'Sin conexión. Intenta de nuevo.' } }
  }
}

/** Pestaña «Agente IA» de WhatsApp (dueño/admin): configura el agente de IA de Meta del número. */
export function WhatsAppAgent() {
  const [data, setData] = useState<AgentState | null>(null)
  const [error, setError] = useState('')
  const [section, setSection] = useState<Section>('ajustes')
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600) }

  async function load() {
    setError('')
    const { ok, data } = await call('/api/whatsapp/agent')
    if (ok) setData(data)
    else setError(data.error || 'No se pudo cargar el agente de IA')
  }
  useEffect(() => { load() }, [])

  if (error) {
    return (
      <div className="wa-card ag-empty">
        <p role="alert">{error}</p>
        <button className="btn btn-ghost" onClick={load}>Reintentar</button>
      </div>
    )
  }
  if (!data) return <div className="wa-card wa-empty"><span className="wa-spinner" /></div>
  if (data.state !== 'ready') return <AgentActivate notEligible={data.state === 'not_eligible'} onActivated={load} />

  const { settings } = data
  const setSettings = (s: AgentSettings) => setData({ ...data, settings: s })
  const setTestNumbers = (testNumbers: TestNumber[]) => setData({ ...data, testNumbers })

  return (
    <div className="wa-scroll">
      <div className="ag-layout">
        <aside className="wa-card ag-nav">
          <AgentStatus settings={settings} testCount={data.testNumbers.length} onChange={setSettings} toast={showToast} />
          <nav className="ag-nav-group" aria-label="Opciones del agente">
            <div className="ag-nav-label">Qué hace y cómo responde</div>
            <NavItem active={section === 'ajustes'} onClick={() => setSection('ajustes')} icon="⚙️"
              title="Ajustes de respuestas" text="A quién contesta y cuándo pasa el chat al equipo" />
            <NavItem active={section === 'prueba'} onClick={() => setSection('prueba')} icon="🧪"
              title="Números de prueba" text="Quién habla con la IA mientras pruebas" badge={`${data.testNumbers.length}/20`} />
          </nav>
        </aside>

        <section className="wa-card ag-panel">
          {section === 'ajustes' && <AgentSettingsForm key={JSON.stringify(settings)} settings={settings} onSaved={setSettings} toast={showToast} />}
          {section === 'prueba' && <TestNumbers list={data.testNumbers} error={data.testNumbersError} onChange={setTestNumbers} toast={showToast} />}
        </section>
      </div>
      {toast && <div className="toast-fixed"><WaIcon.check /> {toast}</div>}
    </div>
  )
}

function NavItem({ active, onClick, icon, title, text, badge }: {
  active: boolean; onClick: () => void; icon: string; title: string; text: string; badge?: string
}) {
  return (
    <button className={`ag-nav-item ${active ? 'active' : ''}`} onClick={onClick} aria-current={active}>
      <span className="ag-nav-ico" aria-hidden="true">{icon}</span>
      <span className="ag-nav-text"><strong>{title}</strong><small>{text}</small></span>
      {badge && <span className="ag-nav-badge">{badge}</span>}
    </button>
  )
}

/* ── Encendido y público ───────────────────────────────────────────────── */
function AgentStatus({ settings, testCount, onChange, toast }: {
  settings: AgentSettings; testCount: number; onChange: (s: AgentSettings) => void; toast: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const everyone = settings.audience === 'EVERYONE'

  async function toggle() {
    setSaving(true); setError('')
    const { ok, data } = await call('/api/whatsapp/agent', {
      method: 'PUT', body: JSON.stringify({ agentId: settings.agentId, enabled: !settings.enabled }),
    })
    setSaving(false)
    if (!ok) return setError(data.error || 'No se pudo cambiar')
    onChange(data.settings ?? { ...settings, enabled: !settings.enabled })
    toast(settings.enabled ? 'Agente apagado' : 'Agente encendido')
  }

  return (
    <div className="ag-status">
      <label className="wa-switch-row">
        <span><strong className="ag-status-title">Agente de IA</strong></span>
        <button role="switch" aria-checked={settings.enabled} aria-label="Encender o apagar el agente de IA"
          className={`wa-switch ${settings.enabled ? 'on' : ''}`} onClick={toggle} disabled={saving}><span /></button>
      </label>
      <div className="ag-pills">
        <span className={`ag-pill ${settings.enabled ? 'ok' : 'off'}`}>{settings.enabled ? '● Encendido' : 'Apagado'}</span>
        <span className={`ag-pill ${everyone ? 'agent' : 'test'}`}>{everyone ? 'Contesta a todos' : 'Solo números de prueba'}</span>
      </div>
      <p className="ag-status-sub">
        {!settings.enabled ? 'No contesta a nadie. Los chats llegan a la bandeja como siempre.'
          : everyone ? 'Contesta a todos tus clientes. Meta cobra cada respuesta de la IA.'
          : `Contesta solo a ${testCount === 1 ? 'tu número' : `tus ${testCount} números`} de prueba. Los demás clientes llegan a la bandeja como siempre.`}
      </p>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}

/* ── Ajustes de respuestas ─────────────────────────────────────────────── */
function AgentSettingsForm({ settings, onSaved, toast }: {
  settings: AgentSettings; onSaved: (s: AgentSettings) => void; toast: (m: string) => void
}) {
  const [audience, setAudience] = useState<AgentAudience>(settings.audience)
  const [handoff, setHandoff] = useState(settings.handoff)
  const [followup, setFollowup] = useState(settings.followup)
  const [neverSay, setNeverSay] = useState(settings.neverSay)
  const [phrase, setPhrase] = useState('')
  const [confirmEveryone, setConfirmEveryone] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dirty = audience !== settings.audience
    || JSON.stringify(handoff) !== JSON.stringify(settings.handoff)
    || JSON.stringify(followup) !== JSON.stringify(settings.followup)
    || JSON.stringify(neverSay) !== JSON.stringify(settings.neverSay)

  function chooseAudience(a: AgentAudience) {
    if (a === 'EVERYONE' && settings.audience !== 'EVERYONE') setConfirmEveryone(true)
    else { setConfirmEveryone(false); setAudience(a) }
  }

  function addPhrase() {
    const p = phrase.trim()
    if (!p || !neverSay) return
    if (!neverSay.includes(p)) setNeverSay([...neverSay, p])
    setPhrase('')
  }

  function discard() {
    setAudience(settings.audience); setHandoff(settings.handoff); setFollowup(settings.followup)
    setNeverSay(settings.neverSay); setConfirmEveryone(false); setError('')
  }

  async function save() {
    setSaving(true); setError('')
    const { ok, data } = await call('/api/whatsapp/agent', {
      method: 'PUT',
      body: JSON.stringify({
        agentId: settings.agentId, audience, handoff, followup,
        ...(neverSay ? { neverSay } : {}),
      }),
    })
    setSaving(false)
    if (!ok) return setError(data.error || 'No se pudo guardar')
    toast('Ajustes guardados')
    onSaved(data.settings ?? { ...settings, audience, handoff, followup, neverSay })
  }

  return (
    <div>
      <h2 className="ag-title">Ajustes de respuestas</h2>
      <p className="ag-lead">Cuándo contesta la IA y qué pasa cuando necesita a una persona.</p>

      <h3 className="ag-h3">¿A quién contesta?</h3>
      <Choice on={audience === 'ALLOWLISTED_ONLY'} onClick={() => chooseAudience('ALLOWLISTED_ONLY')}
        title="Solo a los números de prueba" text="Sin costo. Ideal para probarla antes." />
      <Choice on={audience === 'EVERYONE'} onClick={() => chooseAudience('EVERYONE')}
        title="A todos los clientes" text="Meta pide un método de pago en tu cuenta y cobra cada respuesta de la IA." />
      {confirmEveryone && (
        <div className="ag-callout" role="alert">
          <p>La IA contestará a <strong>todos</strong> los que escriban. Meta cobra cada respuesta a la cuenta de WhatsApp de tu tienda, y si no tiene método de pago, las respuestas no se envían.</p>
          <div className="ag-callout-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmEveryone(false)}>Cancelar</button>
            <button className="btn btn-dark" onClick={() => { setAudience('EVERYONE'); setConfirmEveryone(false) }}>Sí, contestar a todos</button>
          </div>
        </div>
      )}

      <div className="ag-section">
        <h3 className="ag-h3">Cuando pasa el chat al equipo</h3>
        <label className="wa-switch-row ag-row">
          <span>
            <strong>Pasar el chat al equipo</strong>
            <small>Si la IA no sabe algo o el cliente pide hablar con una persona. Les avisamos al celular.</small>
          </span>
          <button role="switch" aria-checked={handoff.enabled} className={`wa-switch ${handoff.enabled ? 'on' : ''}`}
            onClick={() => setHandoff({ ...handoff, enabled: !handoff.enabled })}><span /></button>
        </label>
        {handoff.enabled && (
          <>
            {([
              ['DEFAULT', 'Mensaje estándar de WhatsApp', '«Solicitaré a un representante que responda…»'],
              ['AGENT', 'Que la IA lo escriba', 'Un mensaje distinto en cada chat.'],
              ['CUSTOM', 'Mi propio mensaje', 'Siempre el mismo.'],
            ] as [HandoffSelection, string, string][]).map(([value, title, text]) => (
              <Choice key={value} on={handoff.selection === value} onClick={() => setHandoff({ ...handoff, selection: value })} title={title} text={text} />
            ))}
            {handoff.selection === 'CUSTOM' && (
              <div className="field">
                <label htmlFor="ag-handoff">Tu mensaje</label>
                <input id="ag-handoff" value={handoff.message} maxLength={1000} placeholder="¡Gracias! En un momento alguien del equipo te atiende."
                  onChange={e => setHandoff({ ...handoff, message: e.target.value })} />
              </div>
            )}
          </>
        )}
      </div>

      <div className="ag-section">
        <h3 className="ag-h3">Si el cliente deja de contestar</h3>
        <label className="wa-switch-row ag-row">
          <span>
            <strong>Enviar un recordatorio</strong>
            <small>Un mensaje después de un tiempo sin respuesta del cliente.</small>
          </span>
          <button role="switch" aria-checked={followup.enabled} className={`wa-switch ${followup.enabled ? 'on' : ''}`}
            onClick={() => setFollowup({ ...followup, enabled: !followup.enabled })}><span /></button>
        </label>
        {followup.enabled && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="ag-interval">Después de</label>
              <select id="ag-interval" value={followup.interval} onChange={e => setFollowup({ ...followup, interval: Number(e.target.value) })}>
                {INTERVALS.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ag-followup">Mensaje</label>
              <input id="ag-followup" value={followup.message} maxLength={1000} placeholder="¿Te ayudo con algo más?"
                onChange={e => setFollowup({ ...followup, message: e.target.value })} />
            </div>
          </div>
        )}
      </div>

      {neverSay && (
        <div className="ag-section">
          <h3 className="ag-h3">Frases que nunca debe decir</h3>
          <p className="ag-hint">Si una respuesta de la IA incluye una de estas frases, no se envía.</p>
          <div className="ag-chips">
            {neverSay.map(p => (
              <span key={p} className="ag-chip">{p}
                <button aria-label={`Quitar «${p}»`} onClick={() => setNeverSay(neverSay.filter(x => x !== p))}>×</button>
              </span>
            ))}
          </div>
          <div className="ag-inline">
            <input value={phrase} maxLength={200} placeholder="Escribe una frase" aria-label="Nueva frase prohibida"
              onChange={e => setPhrase(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPhrase() } }} />
            <button className="btn btn-ghost" onClick={addPhrase} disabled={!phrase.trim()}>Agregar</button>
          </div>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="ag-actions">
        <button className="btn btn-ghost" onClick={discard} disabled={!dirty || saving}>Descartar</button>
        <button className="btn btn-primary" onClick={save} disabled={!dirty || saving || confirmEveryone}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  )
}

function Choice({ on, onClick, title, text }: { on: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`ag-choice ${on ? 'on' : ''}`} onClick={onClick}>
      <i aria-hidden="true" />
      <span><strong>{title}</strong><small>{text}</small></span>
    </button>
  )
}

/* ── Números de prueba ─────────────────────────────────────────────────── */
function TestNumbers({ list, error: loadError, onChange, toast }: {
  list: TestNumber[]; error: string | null; onChange: (l: TestNumber[]) => void; toast: (m: string) => void
}) {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function add() {
    setBusy('add'); setError('')
    const { ok, data } = await call('/api/whatsapp/agent/test-numbers', { method: 'POST', body: JSON.stringify({ phone }) })
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo agregar')
    onChange([...list, data.entry]); setPhone(''); toast('Número agregado')
  }

  async function remove(entry: TestNumber) {
    setBusy(entry.id); setError('')
    const { ok, data } = await call(`/api/whatsapp/agent/test-numbers?id=${encodeURIComponent(entry.id)}`, { method: 'DELETE' })
    setBusy(null)
    if (!ok) return setError(data.error || 'No se pudo quitar')
    onChange(list.filter(e => e.id !== entry.id)); toast('Número quitado')
  }

  return (
    <div>
      <h2 className="ag-title">Números de prueba</h2>
      <p className="ag-lead">Mientras la IA contesta «solo a números de prueba», solo estos números hablan con ella. Los demás clientes llegan a la bandeja como siempre.</p>
      <form className="ag-inline" onSubmit={e => { e.preventDefault(); add() }}>
        <input value={phone} inputMode="tel" placeholder="Celular a 10 dígitos" aria-label="Celular de prueba" onChange={e => setPhone(e.target.value)} />
        <button className="btn btn-dark" disabled={!phone.trim() || busy === 'add' || list.length >= 20}>{busy === 'add' ? 'Agregando…' : 'Agregar'}</button>
      </form>
      {(error || loadError) && <p className="field-error" role="alert">{error || loadError}</p>}
      {list.length === 0 ? (
        <p className="ag-hint">Aún no hay números de prueba.</p>
      ) : (
        <ul className="ag-list">
          {list.map(e => (
            <li key={e.id}>
              <span className="ag-list-main"><strong>{e.name || fmtPhone(e.phone)}</strong>{e.name && <small>{fmtPhone(e.phone)}</small>}</span>
              <button className="btn-icon" onClick={() => remove(e)} disabled={busy === e.id} aria-label={`Quitar ${fmtPhone(e.phone)}`} title="Quitar">
                <WaIcon.close size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="ag-hint">Hasta 20 números.</p>
    </div>
  )
}

/* ── Activar ───────────────────────────────────────────────────────────── */
function AgentActivate({ notEligible, onActivated }: { notEligible: boolean; onActivated: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function activate() {
    setBusy(true); setError('')
    const { ok, data } = await call('/api/whatsapp/agent/activate', { method: 'POST' })
    setBusy(false)
    if (!ok) return setError(data.error || 'No se pudo activar')
    onActivated()
  }

  return (
    <div className="wa-scroll">
      <div className="wa-card ag-empty">
        <div className="ag-empty-ico" aria-hidden="true">✨</div>
        <h2 className="ag-title">Agente de IA de WhatsApp</h2>
        {notEligible ? (
          <p className="ag-lead">Meta indica que el número de tu tienda todavía no puede usar el agente de IA. Algunos giros no califican o el número ya usa otro asistente.</p>
        ) : (
          <>
            <p className="ag-lead">Contesta a tus clientes a cualquier hora con la información de tu tienda. Empieza solo con números de prueba, sin costo.</p>
            {error && <p className="field-error" role="alert">{error}</p>}
            <button className="btn btn-primary" onClick={activate} disabled={busy}>{busy ? 'Activando…' : 'Activar agente'}</button>
          </>
        )}
      </div>
    </div>
  )
}
