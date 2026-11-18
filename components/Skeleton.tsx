/**
 * Piezas de los skeletons de carga. Cada pantalla arma el suyo con los MISMOS
 * contenedores y clases que su contenido real, así que al llegar la
 * información nada se mueve de lugar: solo se reemplazan los bloques grises.
 * Estilos: «Skeletons» al final de app/globals.css.
 */
import type { CSSProperties, ReactNode } from 'react'

type Size = number | string

/** Anchos variados (en %) para que las filas no se vean idénticas. */
const WIDTHS = [72, 54, 86, 63, 78, 48, 67, 81, 58, 70]
export const skWidth = (i: number, scale = 1) => `${Math.round(WIDTHS[i % WIDTHS.length] * scale)}%`

/** Repite una fila n veces. */
export const skRows = (n: number, row: (i: number) => ReactNode) => Array.from({ length: n }, (_, i) => row(i))

/** Bloque libre (barras, botones, imágenes). */
export function Sk({ w = '100%', h = 11, r, inline, className, style }: {
  w?: Size; h?: Size; r?: Size; inline?: boolean; className?: string; style?: CSSProperties
}) {
  return (
    <span aria-hidden="true" className={`sk${inline ? ' sk-inline' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: w, height: h, borderRadius: r, ...style }} />
  )
}

/** Una línea de texto: toma el tamaño de letra del contenedor en el que va. */
export function SkText({ w = '60%', inline, className, style }: { w?: Size; inline?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden="true" className={`sk sk-text${inline ? ' sk-inline' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: w, ...style }} />
  )
}

/** Avatar o ícono redondo. */
export function SkCircle({ size = 32, style }: { size?: number; style?: CSSProperties }) {
  return <span aria-hidden="true" className="sk" style={{ width: size, height: size, borderRadius: '50%', ...style }} />
}

/**
 * Envuelve un skeleton: lo anuncia a los lectores de pantalla como «Cargando…»
 * y evita clics sobre lo que todavía no existe.
 */
export function Loading({ label = 'Cargando…', as: Tag = 'div', className, style, children }: {
  label?: string; as?: 'div' | 'section' | 'span'; className?: string; style?: CSSProperties; children: ReactNode
}) {
  return (
    <Tag role="status" aria-busy="true" aria-live="polite" className={`sk-busy${className ? ` ${className}` : ''}`} style={style}>
      <span className="sr-only">{label}</span>
      {children}
    </Tag>
  )
}
