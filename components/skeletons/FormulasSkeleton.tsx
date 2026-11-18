/**
 * Fórmulas mientras carga: los renglones de color de app/(app)/formulas/page.tsx
 * (muestra, código, nombre y base) y la página completa.
 */
import { Search } from 'lucide-react'
import { Loading, SkCircle, SkText, skRows, skWidth } from '@/components/Skeleton'

const ROW: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)',
  display: 'flex', alignItems: 'center', gap: 8,
}

/** Colores de la lista (izquierda). */
export function FormulaRowsSkeleton({ rows = 9 }: { rows?: number }) {
  return (
    <Loading label="Cargando colores…" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {skRows(rows, i => (
        <div key={i} style={ROW}>
          <SkCircle size={22} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5 }}><SkText w={skWidth(i, 0.4)} /></div>
            <div style={{ fontSize: 12 }}><SkText w={skWidth(i + 3, 0.7)} /></div>
          </div>
          <span style={{ fontSize: 11 }}><SkText w={44} /></span>
        </div>
      ))}
    </Loading>
  )
}

/** La página completa (al entrar, antes de que cargue la pantalla). */
export function FormulasPageSkeleton() {
  return (
    <>
      <div className="section-head">
        <h2>Fórmulas</h2>
        <SkText w={220} inline />
      </div>
      <div className="formulas-grid">
        <div className="panel formulas-list" style={{ padding: 16 }}>
          <div className="formulas-search" style={{ marginBottom: 12 }}>
            <Search size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <input placeholder="Buscar por nombre o código (ej. AB238-1, 001-1, Red Planet)…" aria-label="Buscar color" disabled />
          </div>
          <div style={{ fontSize: 11.5, marginBottom: 8 }}><SkText w={120} /></div>
          <FormulaRowsSkeleton />
        </div>
        <div className="panel formulas-detail-panel-empty" style={{ padding: 20, minHeight: 400 }}>
          <div className="formulas-detail-empty" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360, color: 'var(--muted)', fontSize: 13.5, textAlign: 'center' }}>
            Selecciona un color de la lista para ver su fórmula convertida a mL.
          </div>
        </div>
      </div>
    </>
  )
}

