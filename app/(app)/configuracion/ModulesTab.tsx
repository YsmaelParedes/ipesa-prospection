'use client'

import { useState } from 'react'
import { invalidateSession, type ClientStore } from '@/lib/profile'
import { MODULE_INFO, STORE_MODULES, type StoreModule, type StoreModules } from '@/lib/stores'
import { Ico, Panel, WhatsAppGlyph, api, cx, send, useToast } from './ui'
import s from './configuracion.module.css'

const ALWAYS_INCLUDED = ['Dashboard', 'Contactos', 'Leads', 'Recordatorios', 'Catálogos']
const MODULE_LOOK: Record<StoreModule, { icon: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; tone: string }> = {
  whatsapp:  { icon: WhatsAppGlyph, tone: s.tWa },
  campaigns: { icon: Ico.megaphone, tone: s.tMagenta },
  formulas:  { icon: Ico.flask, tone: s.tCyan },
}

export function ModulesTab({ store }: { store: ClientStore }) {
  const [toast, showToast] = useToast()
  const [modules, setModules] = useState<StoreModules>(store.modules)
  const [busy, setBusy]       = useState<StoreModule | null>(null)
  const [error, setError]     = useState('')

  // Se guarda al momento; si falla, se regresa el interruptor
  const toggle = async (m: StoreModule, on: boolean) => {
    const prev = modules
    const next = { ...modules, [m]: on }
    if (m === 'whatsapp' && !on) next.campaigns = false
    setModules(next)
    setBusy(m)
    setError('')
    try {
      await api('/api/store', send('PATCH', { modules: { [m]: on } }))
      invalidateSession()
      showToast(`${MODULE_INFO[m].label} ${on ? 'activado' : 'desactivado'}`)
    } catch (err) {
      setModules(prev)
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Panel icon={Ico.grid} title="Herramientas de la tienda" subtitle="Activa solo lo que usa tu equipo: el menú se ajusta para todos al instante. Apagar un módulo no borra su información.">
        <div className={s.included}>
          <span>Siempre incluido</span>
          {ALWAYS_INCLUDED.map(m => <span key={m} className={s.pill}><Ico.check />{m}</span>)}
        </div>
        <div className={s.mods}>
          {STORE_MODULES.map(m => {
            const blocked = m === 'campaigns' && !modules.whatsapp
            const on = modules[m] && !blocked
            const { icon: I, tone } = MODULE_LOOK[m]
            return (
              <label key={m} className={cx(s.mod, on && s.modOn, blocked && s.modBlocked)}>
                <span className={cx(s.modIcon, tone)}><I /></span>
                <span className={s.modText}>
                  <strong>{MODULE_INFO[m].label}</strong>
                  <small>{MODULE_INFO[m].description}</small>
                  {blocked && <em>Activa WhatsApp para usar campañas.</em>}
                </span>
                <input
                  type="checkbox" role="switch" className={s.switch} aria-label={MODULE_INFO[m].label}
                  checked={on} disabled={blocked || busy !== null} onChange={e => toggle(m, e.target.checked)}
                />
              </label>
            )
          })}
        </div>
        {error && <div className={s.error}>{error}</div>}
      </Panel>
      {toast}
    </>
  )
}
