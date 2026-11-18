/**
 * Contactos mientras carga: la misma tabla de app/(app)/contactos/page.tsx
 * (mismas columnas; en celular se vuelve tarjetas igual que la real).
 */
import { ChevronRight, Search } from 'lucide-react'
import { Loading, Sk, SkCircle, SkText, skRows, skWidth } from '@/components/Skeleton'

/** Solo la tabla: la página ya muestra su encabezado y sus filtros. */
export function ContactsTableSkeleton({ rows = 10, selectable = false }: { rows?: number; selectable?: boolean }) {
  return (
    <Loading label="Cargando contactos…" className="table-wrap contacts-table">
      <table className="table">
        <thead>
          <tr>
            {selectable && <th className="check-cell"><Sk w={16} h={16} r={4} /></th>}
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Segmento</th>
            <th>Canal</th>
            <th className="col-secondary">Registro</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {skRows(rows, i => (
            <tr key={i}>
              {selectable && <td className="check-cell"><Sk w={16} h={16} r={4} /></td>}
              <td>
                <div className="cell-name">
                  <SkCircle size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="nm"><SkText w={skWidth(i, 1.4)} style={{ maxWidth: 190 }} /></div>
                    {i % 3 !== 2 && <div className="em"><SkText w={skWidth(i + 4, 1.2)} style={{ maxWidth: 140 }} /></div>}
                  </div>
                </div>
              </td>
              <td data-label="Teléfono"><SkText w={104} /></td>
              <td data-label="Segmento"><Sk w={skWidth(i + 2)} h={20} r={6} style={{ maxWidth: 96 }} /></td>
              <td data-label="Canal"><Sk w={skWidth(i + 5)} h={20} r={6} style={{ maxWidth: 88 }} /></td>
              <td data-label="Registro" className="col-secondary"><SkText w={84} /></td>
              <td className="cell-chevron" style={{ width: 40, textAlign: 'right', color: 'var(--line-strong)' }}><ChevronRight size={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Loading>
  )
}

/** La página completa (al entrar a Contactos, antes de que cargue la pantalla). */
export function ContactsPageSkeleton() {
  return (
    <>
      <div className="section-head">
        <h2>Contactos</h2>
        <Sk w={44} h={20} r={6} />
        <div className="section-actions"><Sk w={150} h={36} r={8} /></div>
      </div>
      <div className="list-controls">
        <label className="list-search">
          <Search size={16} style={{ color: 'var(--muted)' }} />
          <input placeholder="Buscar por nombre, teléfono, empresa…" disabled aria-label="Buscar contactos" />
        </label>
        <div className="filter-bar" aria-hidden="true">
          {skRows(4, i => <Sk key={i} w={[96, 76, 70, 92][i]} h={32} r={6} />)}
        </div>
      </div>
      <ContactsTableSkeleton />
    </>
  )
}
