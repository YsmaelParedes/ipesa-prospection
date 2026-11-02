'use client'

import { useRef, useState } from 'react'
import { BrandLogo } from '@/components/Brand'
import { APP_NAME } from '@/lib/brand'
import { downloadStoreWorkbook } from '@/lib/exportData'
import { invalidateSession, type ClientStore } from '@/lib/profile'
import { MX_STATES } from '@/lib/mexico'
import { Select, toOptions } from '@/components/Select'
import { Card, CardFoot, Ico, Note, Row, api, send, useToast } from './ui'
import s from './configuracion.module.css'

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO   = 2 * 1024 * 1024

type Form = { name: string; phone: string; email: string; address: string; city: string; state: string }
const formOf = (st: ClientStore): Form => ({
  name: st.name, phone: st.phone ?? '', email: st.email ?? '', address: st.address ?? '', city: st.city ?? '', state: st.state ?? '',
})

export function StoreTab({ store }: { store: ClientStore }) {
  const [toast, showToast] = useToast()
  const [saved, setSaved]   = useState<Form>(() => formOf(store))
  const [form, setForm]     = useState<Form>(() => formOf(store))
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const [logoUrl, setLogoUrl] = useState(store.logoUrl)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = (Object.keys(form) as (keyof Form)[]).some(k => form[k].trim() !== saved[k].trim())
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === 'phone' ? e.target.value.replace(/[^\d\s()+-]/g, '') : e.target.value }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.name.trim().length < 3) { setError('El nombre de la tienda es muy corto.'); return }
    setBusy(true)
    try {
      await api('/api/store', send('PATCH', {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null,
      }))
      setSaved(form)
      invalidateSession()
      showToast('Datos de la tienda guardados')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setLogoError('')
    if (!LOGO_TYPES.includes(file.type)) { setLogoError('Usa una imagen PNG, JPG o WebP.'); return }
    if (file.size > MAX_LOGO) { setLogoError('La imagen debe pesar menos de 2 MB.'); return }
    setLogoBusy(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const data = await api<{ logoUrl: string }>('/api/store/logo', { method: 'POST', body })
      setLogoUrl(data.logoUrl)
      invalidateSession()
      showToast('Logo actualizado')
    } catch (err) {
      setLogoError((err as Error).message)
    } finally {
      setLogoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeLogo = async () => {
    setLogoError('')
    setLogoBusy(true)
    try {
      await api('/api/store/logo', { method: 'DELETE' })
      setLogoUrl(null)
      invalidateSession()
      showToast(`Volviste al logo de ${APP_NAME}`)
    } catch (err) {
      setLogoError((err as Error).message)
    } finally {
      setLogoBusy(false)
    }
  }

  return (
    <>
      {store.access === 'readonly' && (
        <Note kind="warn">Tu tienda está en modo de solo consulta. Puedes ajustar estos datos y descargar tu información, pero para registrar clientes y enviar mensajes necesitas activar tu plan.</Note>
      )}

      <Card as="form" onSubmit={save}>
        <Row label="Logo" hint={`Sale en el menú de tu equipo y en las invitaciones. Horizontal, con fondo blanco o transparente. PNG, JPG o WebP de hasta 2 MB.`}>
          <div className={s.logoLine}>
            <div className={s.logoPreview}>
              {logoUrl
                ? <img src={logoUrl} alt={`Logo de ${store.name}`} />
                : <BrandLogo className={s.logoPreviewBrand} />}
            </div>
            <div className={s.row}>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={logoBusy}>
                <Ico.upload style={{ width: 15, height: 15 }} />{logoBusy ? 'Subiendo…' : logoUrl ? 'Cambiar' : 'Subir logo'}
              </button>
              {logoUrl && <button type="button" className="btn btn-ghost" onClick={removeLogo} disabled={logoBusy}>Quitar</button>}
            </div>
          </div>
          {!logoUrl && <p className={s.controlHint}>Mientras no subas uno, se usa el de {APP_NAME}.</p>}
          {logoError && <div className={s.error}>{logoError}</div>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => upload(e.target.files?.[0])} />
        </Row>

        <Row label="Nombre" htmlFor="st-name" hint="Así aparece en el menú de tu equipo.">
          <input id="st-name" className={s.input} value={form.name} onChange={set('name')} maxLength={80} required placeholder="Pinturas La Paleta" />
        </Row>

        <Row label="Contacto" hint="Se usan en tus mensajes y reportes.">
          <div className={s.fields2}>
            <div className="field">
              <label htmlFor="st-phone">Teléfono</label>
              <input id="st-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={20} placeholder="222 123 4567" />
            </div>
            <div className="field">
              <label htmlFor="st-email">Correo</label>
              <input id="st-email" type="email" value={form.email} onChange={set('email')} maxLength={254} placeholder="ventas@tutienda.com" />
            </div>
          </div>
        </Row>

        <Row label="Ubicación">
          <div className="field">
            <label htmlFor="st-address">Dirección</label>
            <input id="st-address" value={form.address} onChange={set('address')} maxLength={300} placeholder="Calle, número y colonia" />
          </div>
          <div className={s.fields2}>
            <div className="field">
              <label htmlFor="st-city">Ciudad o municipio</label>
              <input id="st-city" value={form.city} onChange={set('city')} maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="st-state">Estado</label>
              <Select id="st-state" value={form.state} onChange={v => setForm(f => ({ ...f, state: v }))}
                options={toOptions(MX_STATES)} placeholder="Selecciona" searchPlaceholder="Buscar estado…" />
            </div>
          </div>
          {error && <div className={s.error}>{error}</div>}
        </Row>

        <CardFoot status={dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}>
          {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setForm(saved); setError('') }}>Descartar</button>}
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </CardFoot>
      </Card>

      <ExportPanel store={store} onDone={showToast} />
      {toast}
    </>
  )
}

/** Descarga completa: un Excel con todo lo de la tienda (también en solo consulta). */
function ExportPanel({ store, onDone }: { store: ClientStore; onDone: (msg: string) => void }) {
  const [step, setStep]   = useState('')
  const [error, setError] = useState('')

  const run = async () => {
    setError('')
    setStep('Contactos')
    try {
      const n = await downloadStoreWorkbook(store.slug, setStep)
      onDone(`Descargado: ${n.contacts.toLocaleString('es-MX')} contactos, ${n.activities.toLocaleString('es-MX')} actividades comerciales y ${n.reminders.toLocaleString('es-MX')} pendientes de agenda`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStep('')
    }
  }

  return (
    <Card>
      <Row label="Tu información" hint="Un Excel con tus contactos, su historial comercial, la agenda y los catálogos. Es de tu tienda: puedes llevártela cuando quieras." align="center">
        <div>
          <button className="btn btn-ghost" onClick={run} disabled={!!step}>
            <Ico.download style={{ width: 15, height: 15 }} />
            {step ? `Preparando ${step.toLowerCase()}…` : 'Descargar'}
          </button>
          {error && <div className={s.error}>{error}</div>}
        </div>
      </Row>
    </Card>
  )
}
