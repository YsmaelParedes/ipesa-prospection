'use client'

import { useEffect, useMemo } from 'react'

/**
 * Protección de la base para vendedores: no se puede seleccionar ni copiar
 * texto, abrir el menú del botón derecho, arrastrar, seleccionar todo ni
 * imprimir, y la pantalla lleva una marca de agua discreta con su nombre (para
 * desalentar fotos y capturas). En los campos donde se escribe sí se puede
 * seleccionar y pegar, para no estorbar el trabajo.
 *
 * Es una barrera en la pantalla, no una garantía: una foto o una captura
 * siguen siendo posibles. Lo que de verdad no debe tener un vendedor lo cuida
 * el servidor (exportar, importar y borrar son solo para administrador).
 */

const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'
const isEditable = (t: EventTarget | null) => t instanceof Element && !!t.closest(EDITABLE)

function watermarkUrl(text: string) {
  const safe = text.replace(/[<>&"']/g, '')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='200'>`
    + `<text x='50%' y='50%' text-anchor='middle' dominant-baseline='middle' transform='rotate(-24 170 100)'`
    + ` font-family='Manrope, system-ui, sans-serif' font-size='13' font-weight='700' fill='#131313'>${safe}</text></svg>`
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`
}

export function CopyGuard({ active, label }: { active: boolean; label: string }) {
  useEffect(() => {
    if (!active) return
    document.body.classList.add('copy-guard')
    const block = (e: Event) => { if (!isEditable(e.target)) e.preventDefault() }
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      // Imprimir y guardar la página, siempre; seleccionar todo / copiar / cortar, fuera de los campos
      if (k === 'p' || k === 's') { e.preventDefault(); return }
      if ((k === 'a' || k === 'c' || k === 'x') && !isEditable(e.target)) e.preventDefault()
    }
    document.addEventListener('copy', block, true)
    document.addEventListener('cut', block, true)
    document.addEventListener('contextmenu', block, true)
    document.addEventListener('dragstart', block, true)
    document.addEventListener('selectstart', block, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.body.classList.remove('copy-guard')
      document.removeEventListener('copy', block, true)
      document.removeEventListener('cut', block, true)
      document.removeEventListener('contextmenu', block, true)
      document.removeEventListener('dragstart', block, true)
      document.removeEventListener('selectstart', block, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [active])

  const background = useMemo(() => watermarkUrl(label), [label])
  if (!active || !label) return null
  return <div className="copy-watermark" aria-hidden="true" style={{ backgroundImage: background }} />
}
