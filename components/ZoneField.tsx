'use client'

import { useState } from 'react'
import { Select, toOptions } from '@/components/Select'

const OTHER = '__otra__'
const key = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Zona de un contacto: la lista de zonas de la tienda y, al final, «Otra…»
 * para escribir una que no está (p. ej. «Veracruz»). Al guardar, el servidor
 * la agrega a las zonas de la tienda; si ya existía con otras mayúsculas o
 * acentos, usa la que ya estaba.
 */
export function ZoneField({ id, value, zones, onChange, label = 'Zona', required = false }: {
  id: string
  value: string
  zones: string[]
  onChange: (zone: string) => void
  label?: string
  required?: boolean
}) {
  // «Otra…» elegida, una zona que no está en la lista o una tienda sin zonas: se escribe
  const [picked, setPicked] = useState(false)
  const typing = picked || zones.length === 0 || (!!value && !zones.some(z => key(z) === key(value)))
  const setTyping = setPicked
  const options = [...toOptions(zones), { value: OTHER, label: 'Otra…' }]

  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      {typing ? (
        <>
          <input id={id} value={value} maxLength={60} autoFocus={picked} placeholder="Escribe la zona, p. ej. Veracruz"
            onChange={e => onChange(e.target.value)} />
          {zones.length > 0 && (
            <button type="button" className="link-btn" style={{ marginTop: 6 }} onClick={() => { setTyping(false); onChange('') }}>
              Elegir de la lista
            </button>
          )}
        </>
      ) : (
        <Select id={id} value={value} placeholder="Elegir zona" options={options}
          onChange={v => { if (v === OTHER) { setTyping(true); onChange('') } else onChange(v) }} />
      )}
    </div>
  )
}
