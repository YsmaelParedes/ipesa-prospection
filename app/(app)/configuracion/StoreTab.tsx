'use client'

import { useRef, useState } from 'react'
import { invalidateSession, type ClientStore } from '@/lib/profile'
import { MX_STATES } from '@/lib/mexico'
import { Ico, Note, Panel, api, cx, send, useToast } from './ui'
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
      showToast('Volviste al logo de IPESA')
    } catch (err) {
      setLogoError((err as Error).message)
    } finally {
      setLogoBusy(false)
    }
  }

  return (
    <>
      <Panel icon={Ico.store} title="Datos de la tienda" subtitle="Tu equipo ve el nombre en el menú; los datos de contacto se usan en tus mensajes y reportes.">
        <form onSubmit={save}>
          <div className={s.formGrid}>
            <div className={cx('field', s.span2)}>
              <label htmlFor="st-name">Nombre de la sucursal</label>
              <input id="st-name" value={form.name} onChange={set('name')} maxLength={80} required placeholder="IPESA Cholula Centro" />
            </div>
            <div className="field">
              <label htmlFor="st-phone">Teléfono</label>
              <input id="st-phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={20} placeholder="222 123 4567" />
            </div>
            <div className="field">
              <label htmlFor="st-email">Correo de la tienda</label>
              <input id="st-email" type="email" value={form.email} onChange={set('email')} maxLength={254} placeholder="ventas@tutienda.com" />
            </div>
            <div className={cx('field', s.span2)}>
              <label htmlFor="st-address">Dirección</label>
              <input id="st-address" value={form.address} onChange={set('address')} maxLength={300} placeholder="Calle, número y colonia" />
            </div>
            <div className="field">
              <label htmlFor="st-city">Ciudad o municipio</label>
              <input id="st-city" value={form.city} onChange={set('city')} maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="st-state">Estado</label>
              <select id="st-state" value={form.state} onChange={set('state')}>
                <option value="">Selecciona</option>
                {MX_STATES.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
          </div>
          {error && <div className={s.error}>{error}</div>}
          <div className={s.formFoot}>
            <small>{dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}</small>
            {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setForm(saved); setError('') }}>Descartar</button>}
            <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </Panel>

      <Panel icon={Ico.image} tone="tCyan" title="Logo de la sucursal" subtitle="Reemplaza al logo de IPESA en el menú de tu equipo y en las invitaciones.">
        <div className={s.logoRow}>
          <div className={s.logoPreview}>
            <img src={logoUrl || '/ipesa-logo.png'} alt={logoUrl ? `Logo de ${store.name}` : 'Logo de IPESA Pinturas'} />
          </div>
          <div className={s.logoSide}>
            <p>{logoUrl ? 'Este es el logo que ve tu equipo.' : 'Estás usando el logo de IPESA.'} Funciona mejor horizontal, con fondo blanco o transparente. PNG, JPG o WebP de hasta 2 MB.</p>
            <div className={s.row}>
              <button type="button" className="btn btn-dark" onClick={() => fileRef.current?.click()} disabled={logoBusy}>
                <Ico.upload style={{ width: 15, height: 15 }} />{logoBusy ? 'Subiendo…' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
              </button>
              {logoUrl && <button type="button" className="btn btn-ghost" onClick={removeLogo} disabled={logoBusy}>Usar el de IPESA</button>}
            </div>
            {logoError && <div className={s.error}>{logoError}</div>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => upload(e.target.files?.[0])} />
          </div>
        </div>
      </Panel>

      {store.access === 'readonly' && (
        <Note kind="warn">Tu tienda está en modo de solo consulta. Puedes ajustar estos datos, pero para registrar clientes y enviar mensajes necesitas activar tu plan.</Note>
      )}
      {toast}
    </>
  )
}
