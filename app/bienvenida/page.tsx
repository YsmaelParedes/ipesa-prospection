'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AuthAlert, AuthField, AuthIcon } from '@/components/AuthUI'
import { invalidateSession, useSession, type ClientStore } from '@/lib/profile'
import { MODULE_INFO, ROLE_LABELS, STORE_MODULES, planOf, type StoreModule, type StoreModules } from '@/lib/stores'
import { MX_STATES } from '@/lib/mexico'
import { pendingInvite } from '@/lib/pendingInvite'
import { signOut } from '@/lib/signOut'
import s from './bienvenida.module.css'

/**
 * Asistente de alta de una tienda: datos de la sucursal → logo →
 * herramientas → equipo → listo. También sirve para agregar otra sucursal
 * (/bienvenida?nueva=1). Cada paso guarda en la API, que valida permisos.
 */

const STEPS = [
  { title: 'Tu sucursal',  desc: 'Nombre y ubicación' },
  { title: 'Tu logo',      desc: 'Cómo se verá tu tienda' },
  { title: 'Herramientas', desc: 'Lo que usará tu equipo' },
  { title: 'Tu equipo',    desc: 'Invita a tus vendedores' },
]
const DONE = STEPS.length

type Profile = { name: string; city: string; state: string; phone: string; address: string }
type Invite = { id: string; email: string; role: 'admin' | 'employee'; link: string }

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO   = 2 * 1024 * 1024

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

async function api(path: string, init?: RequestInit) {
  const res  = await fetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Algo salió mal. Intenta de nuevo.')
  return data
}
const send = (method: string, body: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

const profileOf = (st: ClientStore): Profile => ({
  name: st.name, city: st.city ?? '', state: st.state ?? '', phone: st.phone ?? '', address: st.address ?? '',
})

/* ── Iconos ─────────────────────────────────────────────────────────────── */
type IconProps = React.SVGProps<SVGSVGElement>
const icon = (d: React.ReactNode) => function Svg(p: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{d}</svg>
}
const Ic = {
  dashboard: icon(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  contacts:  icon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  leads:     icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
  chat:      icon(<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z" />),
  clock:     icon(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  flask:     icon(<><path d="M9 2v6.3a2 2 0 0 1-.3 1L3.5 18a2 2 0 0 0 1.7 3h13.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2" /><path d="M7 2h10M6 14h12" /></>),
  settings:  icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" /></>),
  megaphone: icon(<><path d="m3 11 18-5v12L3 14v-3Z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  upload:    icon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></>),
  copy:      icon(<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  back:      icon(<path d="M19 12H5M11 18l-6-6 6-6" />),
  plus:      icon(<path d="M12 5v14M5 12h14" />),
  image:     icon(<><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>),
  store:     icon(<><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /></>),
}
function WhatsAppGlyph(p: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
      <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" />
    </svg>
  )
}

const MODULE_ICON: Record<StoreModule, (p: IconProps) => React.ReactElement> = {
  whatsapp: WhatsAppGlyph, campaigns: Ic.megaphone, formulas: Ic.flask,
}

/* ── Página ─────────────────────────────────────────────────────────────── */
export default function WelcomePage() {
  return <Suspense fallback={<Loader />}><Wizard /></Suspense>
}

function Loader() {
  return <div className={s.loader}><span className="auth-spinner dark" /></div>
}

function Wizard() {
  const addingStore = useSearchParams().get('nueva') === '1'
  const session = useSession()

  const [step, setStep]       = useState<number | null>(null)   // null = decidiendo
  const [store, setStore]     = useState<ClientStore | null>(null)
  const [profile, setProfile] = useState<Profile>({ name: 'IPESA ', city: '', state: '', phone: '', address: '' })
  const [modules, setModules] = useState<StoreModules>({ whatsapp: true, campaigns: true, formulas: true })
  const [invites, setInvites] = useState<Invite[]>([])

  // Por dónde empezar: tienda nueva, retomar la configuración o ya terminó
  useEffect(() => {
    if (session === undefined || step !== null) return
    if (session === null) { window.location.replace('/login?next=%2Fbienvenida'); return }
    const current = session.store
    // Viene de confirmar su correo tras aceptar una invitación: de vuelta a ella
    const invite = !current && pendingInvite()
    if (invite) { window.location.replace(`/invitacion/${invite}`); return }
    if (current && !addingStore) {
      if (current.onboardingCompleted || !session.isAdmin) { window.location.replace('/'); return }
      setStore(current)
      setProfile(profileOf(current))
      setModules(current.modules)
      setStep(1)
    } else {
      setStep(0)
    }
  }, [session, addingStore, step])

  // Cada paso empieza arriba (en celular el formulario anterior pudo quedar abajo)
  useEffect(() => {
    if (step !== null) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  // Al llegar al final la tienda queda marcada como configurada
  useEffect(() => {
    if (step !== DONE) return
    fetch('/api/store', send('PATCH', { onboardingCompleted: true }))
      .then(() => invalidateSession())
      .catch(() => {})
  }, [step])

  if (!session || step === null) return <Loader />

  const isOwner = !store || session.store?.id !== store.id || !!session.isOwner

  return (
    <div className={s.page}>
      <div className="brand-line" aria-hidden="true" />
      <header className={s.top}>
        <img src="/ipesa-logo.png" alt="IPESA Pinturas" width={480} height={209} className={s.logo} />
        <div className={s.topRight}>
          {addingStore && session.store && step === 0 && (
            <Link href="/" className={s.topLink}><Ic.back />Volver a {session.store.name}</Link>
          )}
          <span className={s.topUser} title={session.user.email}>{session.user.email}</span>
          <button className={s.topLink} onClick={() => signOut()}>Salir</button>
        </div>
      </header>

      {step < DONE && <Stepper step={step} />}

      <main className={s.main}>
        {step === DONE && store ? (
          <DoneStep store={store} modules={modules} invites={invites.length} />
        ) : (
          <div className={s.layout}>
            <section className={s.card} key={step}>
              {step === 0 && (
                <StoreStep
                  profile={profile} setProfile={setProfile} store={store} addingStore={addingStore}
                  onSaved={st => { setStore(st); setStep(1) }}
                />
              )}
              {step === 1 && store && (
                <LogoStep store={store} onLogo={logoUrl => setStore({ ...store, logoUrl })} onBack={() => setStep(0)} onNext={() => setStep(2)} />
              )}
              {step === 2 && store && (
                <ModulesStep
                  modules={modules} setModules={setModules} onBack={() => setStep(1)}
                  onSaved={m => { setStore({ ...store, modules: m }); setStep(3) }}
                />
              )}
              {step === 3 && store && (
                <TeamStep
                  store={store} canInviteAdmins={isOwner} invites={invites}
                  onInvite={inv => setInvites(list => [inv, ...list.filter(i => i.email !== inv.email)])}
                  onBack={() => setStep(2)} onNext={() => setStep(DONE)}
                />
              )}
            </section>
            <aside className={s.aside}>
              {step === 3 && store
                ? <TeamPreview owner={session.user} store={store} invites={invites} />
                : <BrandPreview
                    name={profile.name}
                    logoUrl={store?.logoUrl ?? null}
                    modules={modules}
                    focus={step === 0 ? 'name' : step === 1 ? 'logo' : 'nav'}
                  />}
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

/* ── Progreso ───────────────────────────────────────────────────────────── */
function Stepper({ step }: { step: number }) {
  return (
    <nav className={s.stepperWrap} aria-label="Progreso">
      <ol className={s.stepper}>
        {STEPS.map((st, i) => (
          <li key={st.title} className={cx(s.step, i < step && s.stepDone, i === step && s.stepCurrent)} aria-current={i === step ? 'step' : undefined}>
            <span className={s.stepNum}>{i < step ? <AuthIcon.check /> : i + 1}</span>
            <span className={s.stepText}><strong>{st.title}</strong><small>{st.desc}</small></span>
          </li>
        ))}
      </ol>
      <div className={s.progressMobile}>
        <span>Paso {step + 1} de {STEPS.length} · <strong>{STEPS[step].title}</strong></span>
        <div className={s.progressBar}><i style={{ width: `${100 - ((step + 1) / STEPS.length) * 100}%` }} /></div>
      </div>
    </nav>
  )
}

function StepHead({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className={s.head}>
      <span className={s.kicker}>Paso {n} de {STEPS.length}</span>
      <h1>{title}</h1>
      <p>{children}</p>
    </div>
  )
}

function Actions({ onBack, backLabel = 'Atrás', backHref, children }: {
  onBack?: () => void; backLabel?: string; backHref?: string; children: React.ReactNode
}) {
  return (
    <div className={s.actions}>
      {backHref
        ? <Link href={backHref} className={cx(s.btn, s.ghost)}>{backLabel}</Link>
        : onBack ? <button type="button" className={cx(s.btn, s.ghost)} onClick={onBack} aria-label={backLabel}><Ic.back /><span className={s.backLabel}>{backLabel}</span></button> : <span />}
      {children}
    </div>
  )
}

function NextButton({ busy, children, type = 'submit', onClick }: {
  busy?: boolean; children: React.ReactNode; type?: 'submit' | 'button'; onClick?: () => void
}) {
  return (
    <button type={type} className={cx(s.btn, s.primary)} disabled={busy} onClick={onClick}>
      {busy && <span className="auth-spinner" />}
      <span>{children}</span>
      {!busy && <AuthIcon.arrow className={s.btnArrow} />}
    </button>
  )
}

/* ── Paso 1: sucursal ───────────────────────────────────────────────────── */
function StoreStep({ profile, setProfile, store, addingStore, onSaved }: {
  profile: Profile
  setProfile: React.Dispatch<React.SetStateAction<Profile>>
  store: ClientStore | null
  addingStore: boolean
  onSaved: (store: ClientStore) => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setProfile(p => ({ ...p, [k]: k === 'phone' ? e.target.value.replace(/[^\d\s()+-]/g, '') : e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const body = {
      name: profile.name.trim(),
      city: profile.city.trim() || null,
      state: profile.state || null,
      phone: profile.phone.trim() || null,
      address: profile.address.trim() || null,
    }
    if (body.name.length < 3) { setError('Escribe el nombre de tu sucursal.'); return }
    setBusy(true)
    try {
      if (store) {
        await api('/api/store', send('PATCH', body))
        onSaved({ ...store, ...body })
      } else {
        const data = await api('/api/stores', send('POST', body))
        onSaved(data.store as ClientStore)
      }
      invalidateSession()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHead n={1} title={addingStore ? 'Agrega una sucursal' : 'Empecemos por tu tienda'}>
        Así la identificará tu equipo dentro de IPESA CRM. Puedes cambiarlo después en Configuración.
      </StepHead>
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} className="auth-form">
        <AuthField
          label="Nombre de la sucursal" icon={AuthIcon.store} value={profile.name} onChange={set('name')}
          required minLength={3} maxLength={80} placeholder="IPESA Cholula Centro" autoFocus autoComplete="organization"
          hint="Usa el nombre con el que te conocen tus clientes."
        />
        <div className={s.grid2}>
          <AuthField
            label="Ciudad o municipio" icon={AuthIcon.pin} value={profile.city} onChange={set('city')}
            required maxLength={80} placeholder="San Andrés Cholula" autoComplete="address-level2"
          />
          <div className="auth-field">
            <label htmlFor="f-state">Estado</label>
            <div className="auth-input">
              <AuthIcon.pin className="auth-input-icon" />
              <select id="f-state" className={s.select} value={profile.state} onChange={set('state')} required autoComplete="address-level1">
                <option value="" disabled>Selecciona</option>
                {MX_STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
          </div>
        </div>
        <AuthField
          label="Teléfono de la tienda (opcional)" icon={AuthIcon.phone} type="tel" inputMode="tel"
          value={profile.phone} onChange={set('phone')} maxLength={20} placeholder="222 123 4567" autoComplete="tel"
        />
        <AuthField
          label="Dirección (opcional)" icon={AuthIcon.pin} value={profile.address} onChange={set('address')}
          maxLength={300} placeholder="Calle, número y colonia" autoComplete="street-address"
        />
        <Actions backHref={addingStore && !store ? '/' : undefined} backLabel="Cancelar">
          <NextButton busy={busy}>{store ? 'Guardar y continuar' : 'Crear mi tienda'}</NextButton>
        </Actions>
      </form>
      {!addingStore && !store && (
        <p className={s.tip}>¿Te invitaron a trabajar en una tienda que ya usa IPESA CRM? No crees otra: abre el enlace de tu invitación.</p>
      )}
    </>
  )
}

/* ── Paso 2: logo ───────────────────────────────────────────────────────── */
function LogoStep({ store, onLogo, onBack, onNext }: {
  store: ClientStore; onLogo: (url: string | null) => void; onBack: () => void; onNext: () => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')
  const [over, setOver]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError('')
    if (!LOGO_TYPES.includes(file.type)) { setError('Usa una imagen PNG, JPG o WebP.'); return }
    if (file.size > MAX_LOGO) { setError('La imagen debe pesar menos de 2 MB.'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await api('/api/store/logo', { method: 'POST', body: form })
      onLogo(data.logoUrl)
      invalidateSession()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    setError('')
    setBusy(true)
    try {
      await api('/api/store/logo', { method: 'DELETE' })
      onLogo(null)
      invalidateSession()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHead n={2} title="Sube el logo de tu sucursal">
        Aparece en el menú y en las invitaciones a tu equipo. Si aún no tienes uno, usamos el de IPESA.
      </StepHead>
      {error && <AuthAlert>{error}</AuthAlert>}
      <div
        className={cx(s.drop, over && s.dropOver, store.logoUrl && s.dropHas)}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]) }}
      >
        {store.logoUrl
          ? <img src={store.logoUrl} alt={`Logo de ${store.name}`} className={s.dropImg} />
          : <span className={s.dropIcon}><Ic.image /></span>}
        <strong>{store.logoUrl ? 'Así se ve tu logo' : 'Arrastra tu logo aquí'}</strong>
        <span className={s.dropHint}>PNG, JPG o WebP · máximo 2 MB</span>
        <div className={s.dropActions}>
          <button type="button" className={cx(s.btn, s.soft)} onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <span className={cx('auth-spinner dark', s.spinSm)} /> : <Ic.upload />}
            {store.logoUrl ? 'Cambiar imagen' : 'Elegir imagen'}
          </button>
          {store.logoUrl && (
            <button type="button" className={cx(s.btn, s.ghost, s.danger)} onClick={remove} disabled={busy}>Quitar</button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => upload(e.target.files?.[0])} />
      </div>
      <p className={s.tip}><strong>Tip:</strong> un logo horizontal con fondo blanco o transparente luce mejor en el menú.</p>
      <Actions onBack={onBack}>
        <NextButton type="button" onClick={onNext} busy={busy}>{store.logoUrl ? 'Continuar' : 'Omitir por ahora'}</NextButton>
      </Actions>
    </>
  )
}

/* ── Paso 3: herramientas ───────────────────────────────────────────────── */
const ALWAYS_INCLUDED = ['Dashboard', 'Contactos', 'Leads', 'Recordatorios']

function ModulesStep({ modules, setModules, onBack, onSaved }: {
  modules: StoreModules
  setModules: React.Dispatch<React.SetStateAction<StoreModules>>
  onBack: () => void
  onSaved: (m: StoreModules) => void
}) {
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    setBusy(true)
    const next = { ...modules, campaigns: modules.whatsapp && modules.campaigns }
    try {
      await api('/api/store', send('PATCH', { modules: next }))
      invalidateSession()
      onSaved(next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHead n={3} title="Elige las herramientas de tu tienda">
        Activa solo lo que tu equipo va a usar; el menú se adapta. Puedes cambiarlo cuando quieras.
      </StepHead>
      {error && <AuthAlert>{error}</AuthAlert>}
      <div className={s.included}>
        <span className={s.includedLabel}>Siempre incluido</span>
        {ALWAYS_INCLUDED.map(m => <span key={m} className={s.pill}><AuthIcon.check />{m}</span>)}
      </div>
      <div className={s.mods}>
        {STORE_MODULES.map(m => {
          const blocked = m === 'campaigns' && !modules.whatsapp
          const on = modules[m] && !blocked
          const ModIcon = MODULE_ICON[m]
          return (
            <label key={m} className={cx(s.mod, on && s.modOn, blocked && s.modBlocked)}>
              <span className={cx(s.modIcon, s[`mod_${m}`])}><ModIcon /></span>
              <span className={s.modText}>
                <strong>{MODULE_INFO[m].label}</strong>
                <small>{MODULE_INFO[m].description}</small>
                {m === 'whatsapp' && on && <em>Conectas tu número de WhatsApp Business desde Configuración.</em>}
                {blocked && <em>Necesita el módulo de WhatsApp.</em>}
              </span>
              <input
                type="checkbox" role="switch" className={s.switch} checked={on} disabled={blocked}
                onChange={e => setModules(prev => ({ ...prev, [m]: e.target.checked }))}
                aria-label={MODULE_INFO[m].label}
              />
            </label>
          )
        })}
      </div>
      <Actions onBack={onBack}>
        <NextButton type="button" onClick={save} busy={busy}>Guardar y continuar</NextButton>
      </Actions>
    </>
  )
}

/* ── Paso 4: equipo ─────────────────────────────────────────────────────── */
function TeamStep({ store, canInviteAdmins, invites, onInvite, onBack, onNext }: {
  store: ClientStore; canInviteAdmins: boolean; invites: Invite[]
  onInvite: (inv: Invite) => void; onBack: () => void; onNext: () => void
}) {
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState<'employee' | 'admin'>('employee')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [copied, setCopied] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api('/api/store/invitations', send('POST', { email, role }))
      onInvite({ id: data.invitation.id, email: data.invitation.email, role: data.invitation.role, link: data.link })
      setEmail('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (inv: Invite) => {
    try { await navigator.clipboard.writeText(inv.link) } catch { window.prompt('Copia el enlace:', inv.link); return }
    setCopied(inv.id)
    setTimeout(() => setCopied(c => (c === inv.id ? '' : c)), 2000)
  }
  const waLink = (inv: Invite) => `https://wa.me/?text=${encodeURIComponent(
    `Hola, te invito a unirte al equipo de ${store.name} en IPESA CRM. Crea tu acceso aquí: ${inv.link}`,
  )}`

  return (
    <>
      <StepHead n={4} title="Invita a tu equipo">
        Cada persona entra con su propio usuario. Genera su enlace y compártelo por WhatsApp o correo; vence en 7 días.
      </StepHead>
      {error && <AuthAlert>{error}</AuthAlert>}
      <form onSubmit={submit} className={s.inviteForm}>
        <AuthField
          label="Correo de la persona" icon={AuthIcon.mail} type="email" value={email}
          onChange={e => setEmail(e.target.value)} required maxLength={254} placeholder="vendedor@correo.com" autoComplete="off"
        />
        <div className="auth-field">
          <span className={s.fieldLabel}>Rol</span>
          <div className={s.seg} role="radiogroup" aria-label="Rol">
            <button type="button" role="radio" aria-checked={role === 'employee'} className={cx(role === 'employee' && s.segOn)} onClick={() => setRole('employee')}>Vendedor</button>
            {canInviteAdmins && (
              <button type="button" role="radio" aria-checked={role === 'admin'} className={cx(role === 'admin' && s.segOn)} onClick={() => setRole('admin')}>Administrador</button>
            )}
          </div>
        </div>
        <button type="submit" className={cx(s.btn, s.dark)} disabled={busy}>
          {busy ? <span className="auth-spinner" /> : <Ic.plus />}Crear invitación
        </button>
      </form>
      <p className={s.roleHelp}>
        {role === 'employee'
          ? <><strong>Vendedor:</strong> registra contactos, leads y recordatorios, y atiende WhatsApp.</>
          : <><strong>Administrador:</strong> además configura la tienda, los catálogos y el equipo.</>}
      </p>

      {invites.length > 0 && (
        <ul className={s.invites}>
          {invites.map(inv => (
            <li key={inv.id} className={s.invite}>
              <span className={s.inviteAvatar}>{inv.email[0]?.toUpperCase()}</span>
              <span className={s.inviteWho}>
                <strong>{inv.email}</strong>
                <small>{ROLE_LABELS[inv.role]} · enlace listo</small>
              </span>
              <span className={s.inviteActions}>
                <button type="button" className={cx(s.btn, s.soft, s.sm)} onClick={() => copy(inv)}>
                  {copied === inv.id ? <AuthIcon.check /> : <Ic.copy />}{copied === inv.id ? 'Copiado' : 'Copiar'}
                </button>
                <a className={cx(s.btn, s.wa, s.sm)} href={waLink(inv)} target="_blank" rel="noopener noreferrer">
                  <WhatsAppGlyph />WhatsApp
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Actions onBack={onBack}>
        <NextButton type="button" onClick={onNext}>{invites.length ? 'Terminar' : 'Omitir por ahora'}</NextButton>
      </Actions>
    </>
  )
}

/* ── Listo ──────────────────────────────────────────────────────────────── */
function DoneStep({ store, modules, invites }: { store: ClientStore; modules: StoreModules; invites: number }) {
  const trialEnd = store.trialEndsAt
    ? new Date(store.trialEndsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
    : null

  const next = [
    modules.whatsapp
      ? { href: '/configuracion?tab=whatsapp', icon: WhatsAppGlyph, tone: s.nextWa, title: 'Conecta tu WhatsApp', text: 'Usa el número de tu tienda para atender y enviar campañas.' }
      : { href: '/leads', icon: Ic.leads, tone: s.nextBrand, title: 'Registra tu primer lead', text: 'Da seguimiento a cada cotización hasta cerrarla.' },
    { href: '/contactos', icon: Ic.contacts, tone: s.nextCyan, title: 'Agrega tus clientes', text: 'Captúralos uno por uno o importa tu lista de Excel.' },
    { href: '/configuracion?tab=catalogos', icon: Ic.settings, tone: s.nextMagenta, title: 'Ajusta tus catálogos', text: 'Segmentos y canales con los que trabaja tu tienda.' },
  ]

  return (
    <section className={s.done}>
      <div className={s.doneBadge} aria-hidden="true"><span><AuthIcon.check /></span></div>
      <h1>¡{store.name} está lista!</h1>
      <p className={s.doneSub}>
        Tu prueba gratis ya empezó{trialEnd ? <> y dura hasta el <strong>{trialEnd}</strong></> : null}. Tienes todas las funciones disponibles.
        {invites > 0 && <> Cuando tu equipo acepte su invitación lo verás en Configuración.</>}
      </p>
      <div className={s.next}>
        {next.map(n => (
          <Link key={n.href} href={n.href} className={s.nextCard}>
            <span className={cx(s.nextIcon, n.tone)}><n.icon /></span>
            <strong>{n.title}</strong>
            <span className={s.nextText}>{n.text}</span>
            <span className={s.nextGo}>Ir ahora <AuthIcon.arrow /></span>
          </Link>
        ))}
      </div>
      <Link href="/" className={cx(s.btn, s.primary, s.lg)}>
        Entrar a mi tienda <AuthIcon.arrow className={s.btnArrow} />
      </Link>
    </section>
  )
}

/* ── Vista previa ───────────────────────────────────────────────────────── */
const PREVIEW_NAV: { label: string; icon: (p: IconProps) => React.ReactElement; module?: StoreModule }[] = [
  { label: 'Dashboard', icon: Ic.dashboard },
  { label: 'Contactos', icon: Ic.contacts },
  { label: 'Leads', icon: Ic.leads },
  { label: 'WhatsApp', icon: Ic.chat, module: 'whatsapp' },
  { label: 'Recordatorios', icon: Ic.clock },
  { label: 'Fórmulas', icon: Ic.flask, module: 'formulas' },
  { label: 'Configuración', icon: Ic.settings },
]
const BARS = [38, 62, 48, 80, 56, 92, 70]

function BrandPreview({ name, logoUrl, modules, focus }: {
  name: string; logoUrl: string | null; modules: StoreModules; focus: 'name' | 'logo' | 'nav'
}) {
  const items = PREVIEW_NAV.filter(it => !it.module || modules[it.module])
  return (
    <div className={s.preview}>
      <div className={s.previewLabel}><span className={s.liveDot} />Vista previa</div>
      <div className={s.mock} aria-hidden="true">
        <div className={s.mockBar}><i /><i /><i /></div>
        <div className={s.mockBody}>
          <div className={s.mockSide}>
            <img src={logoUrl || '/ipesa-logo.png'} alt="" className={cx(s.mockLogo, focus === 'logo' && s.hl)} />
            <div className={cx(s.mockStore, focus === 'name' && s.hl)}>
              <Ic.store /><span>{name.trim() || 'Tu sucursal'}</span>
            </div>
            <div className={cx(s.mockNav, focus === 'nav' && s.hlNav)}>
              {items.map((it, i) => (
                <div key={it.label} className={cx(s.mockItem, i === 0 && s.mockActive)}>
                  <it.icon /><span>{it.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={s.mockMain}>
            <div className={s.mockTitle} />
            <div className={s.mockKpis}><span /><span /><span /></div>
            <div className={s.mockChart}>
              {BARS.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
            </div>
            <div className={s.mockRows}><span /><span /><span /></div>
          </div>
        </div>
      </div>
      <p className={s.previewNote}>
        {focus === 'name' && 'El nombre de tu sucursal aparece junto al logo, en el menú de toda la app.'}
        {focus === 'logo' && 'Tu logo reemplaza al de IPESA en el menú de tu equipo.'}
        {focus === 'nav' && 'El menú muestra solo las herramientas que actives.'}
      </p>
    </div>
  )
}

function TeamPreview({ owner, store, invites }: { owner: { name: string; email: string }; store: ClientStore; invites: Invite[] }) {
  const { maxUsers, label } = planOf(store.plan)
  const used = 1 + invites.length
  return (
    <div className={s.preview}>
      <div className={s.previewLabel}><span className={s.liveDot} />Tu equipo</div>
      <div className={s.team}>
        <div className={s.member}>
          <span className={cx(s.inviteAvatar, s.ownerAvatar)}>{(owner.name || owner.email)[0]?.toUpperCase()}</span>
          <span className={s.inviteWho}><strong>{owner.name || owner.email}</strong><small>Dueño · tú</small></span>
        </div>
        {invites.map(inv => (
          <div key={inv.id} className={s.member}>
            <span className={s.inviteAvatar}>{inv.email[0]?.toUpperCase()}</span>
            <span className={s.inviteWho}><strong>{inv.email}</strong><small>{ROLE_LABELS[inv.role]} · invitación enviada</small></span>
          </div>
        ))}
        {invites.length === 0 && <div className={s.memberGhost}>Aquí aparecerán las personas que invites</div>}
      </div>
      <div className={s.seats}>
        <div className={s.seatsTop}><span>Plan {label}</span><strong>{used} de {maxUsers} usuarios</strong></div>
        <div className={s.seatBar}><i style={{ width: `${Math.min(100, (used / maxUsers) * 100)}%` }} /></div>
      </div>
    </div>
  )
}
