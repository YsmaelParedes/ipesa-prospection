'use client'

import { useEffect, useState } from 'react'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { DEFAULT_TERMS, type QuoteSettings } from '@/lib/quotes'
import { SkText } from '@/components/Skeleton'
import { Card, CardFoot, Note, Row, api, cx, send, useToast } from './ui'
import s from './configuracion.module.css'

type Form = { validDays: string; terms: string; taxDefault: boolean; taxRate: 16 | 8; rfc: string; legalName: string }
const formOf = (st: QuoteSettings): Form => ({ ...st, validDays: String(st.validDays) })
const same = (a: Form, b: Form) => (Object.keys(a) as (keyof Form)[]).every(k => String(a[k]).trim() === String(b[k]).trim())

/**
 * Configuración → Cotizaciones (administradores): lo que lleva de inicio cada
 * cotización nueva (validez, IVA, condiciones) y los datos fiscales de la hoja.
 */
export function QuotesTab({ readonly }: { readonly: boolean }) {
  const [toast, showToast] = useToast()
  const { data } = useCachedQuery<{ settings: QuoteSettings }>('/api/data/quotes/settings')
  const [saved, setSaved] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (data && !saved) { const f = formOf(data.settings); setSaved(f); setForm(f) }
  }, [data, saved])

  const dirty = !!form && !!saved && !same(form, saved)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setError('')
    const days = Number(form.validDays)
    if (!Number.isInteger(days) || days < 1 || days > 365) { setError('La validez va de 1 a 365 días.'); return }
    setBusy(true)
    try {
      const { settings } = await api<{ settings: QuoteSettings }>('/api/data/quotes/settings', send('PUT', {
        validDays: days, terms: form.terms.trim(), taxDefault: form.taxDefault, taxRate: form.taxRate,
        rfc: form.rfc.trim(), legalName: form.legalName.trim(),
      }))
      const f = formOf(settings)
      setSaved(f); setForm(f)
      showToast('Ajustes de cotizaciones guardados')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {readonly && <Note kind="warn">Tu tienda está en modo de solo consulta: puedes ver estos ajustes, pero no hacer cotizaciones nuevas.</Note>}
      <Card as="form" onSubmit={save}>
        <Row label="Validez" htmlFor="qt-days" hint="Cuántos días vale una cotización nueva. Se puede cambiar en cada una.">
          {form ? (
            <div className={s.row}>
              <input id="qt-days" className={s.input} style={{ width: 90 }} inputMode="numeric" value={form.validDays} maxLength={3}
                onChange={e => set('validDays', e.target.value.replace(/\D/g, ''))} />
              <span className={s.controlHint}>días</span>
            </div>
          ) : <SkText w={120} />}
        </Row>
        <Row label="IVA" hint="Los precios se capturan sin IVA y la cotización lo suma. En zona fronteriza, usa 8 %.">
          {form ? (
            <div className={s.row}>
              <div className={s.seg} role="group" aria-label="Tasa de IVA">
                {([16, 8] as const).map(r => (
                  <button key={r} type="button" className={cx(form.taxRate === r && s.segOn)} aria-pressed={form.taxRate === r} onClick={() => set('taxRate', r)}>{r} %</button>
                ))}
              </div>
              <label className={s.controlHint} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.taxDefault} onChange={e => set('taxDefault', e.target.checked)} />
                Las cotizaciones nuevas llevan IVA
              </label>
            </div>
          ) : <SkText w={220} />}
        </Row>
        <Row label="Datos fiscales" hint="Opcional. Aparecen debajo del nombre de tu tienda en la cotización.">
          {form ? (
            <div className={s.fields2}>
              <div className="field">
                <label htmlFor="qt-legal">Razón social</label>
                <input id="qt-legal" value={form.legalName} maxLength={200} onChange={e => set('legalName', e.target.value)} placeholder="Pinturas La Paleta S.A. de C.V." />
              </div>
              <div className="field">
                <label htmlFor="qt-rfc">RFC</label>
                <input id="qt-rfc" value={form.rfc} maxLength={13} onChange={e => set('rfc', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="PLP010101AB1" />
              </div>
            </div>
          ) : <SkText w="80%" />}
        </Row>
        <Row label="Condiciones" htmlFor="qt-terms" hint="Van al pie de cada cotización nueva: vigencia de precios, tiempos de entrega, forma de pago…">
          {form ? (
            <>
              <div className="field" style={{ marginBottom: 0 }}>
                <textarea id="qt-terms" rows={4} maxLength={2000} value={form.terms} onChange={e => set('terms', e.target.value)} />
              </div>
              {form.terms.trim() !== DEFAULT_TERMS && (
                <button type="button" className="link-btn muted" style={{ marginTop: 6, fontSize: 12.5 }} onClick={() => set('terms', DEFAULT_TERMS)}>Usar el texto sugerido</button>
              )}
            </>
          ) : <SkText w="90%" />}
          {error && <div className={s.error}>{error}</div>}
        </Row>
        <CardFoot status={dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}>
          {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setForm(saved); setError('') }}>Descartar</button>}
          <button type="submit" className="btn btn-primary" disabled={!dirty || busy || readonly}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </CardFoot>
      </Card>
      {toast}
    </>
  )
}
