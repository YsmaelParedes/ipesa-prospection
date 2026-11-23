'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import s from './reportes.module.css'

export type Column<T> = {
  key: string
  head: string
  cell: (row: T) => ReactNode
  /** Valor para ordenar (sin él, la columna no se ordena). */
  sort?: (row: T) => number | string
  right?: boolean
  foot?: ReactNode
}

/**
 * Tabla de Reportes: se ordena tocando el encabezado (otra vez, al revés).
 * Los números se ordenan de mayor a menor la primera vez.
 */
export function SortTable<T>({ rows, columns, rowKey, initial, label }: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  initial?: { key: string; desc: boolean }
  label: string
}) {
  const [by, setBy] = useState(initial ?? null)
  const sorted = useMemo(() => {
    const col = by && columns.find(c => c.key === by.key)
    if (!col?.sort) return rows
    const get = col.sort
    return rows.slice().sort((a, b) => {
      const x = get(a), y = get(b)
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')
      return by!.desc ? -cmp : cmp
    })
  }, [rows, columns, by])
  const hasFoot = columns.some(c => c.foot !== undefined)

  return (
    <div className={s.tableWrap}>
      <table className={s.table} aria-label={label}>
        <thead>
          <tr>
            {columns.map(c => {
              const active = by?.key === c.key
              return (
                <th key={c.key} className={c.right ? s.r : undefined} scope="col"
                  aria-sort={active ? (by!.desc ? 'descending' : 'ascending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => setBy(b => b?.key === c.key ? { key: c.key, desc: !b.desc } : { key: c.key, desc: typeof c.sort!(rows[0] ?? ({} as T)) === 'number' })}>
                      {c.head}
                      {active && (by!.desc ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />)}
                    </button>
                  ) : c.head}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={rowKey(r)}>
              {columns.map(c => <td key={c.key} className={c.right ? s.r : undefined}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {hasFoot && (
          <tfoot>
            <tr>{columns.map(c => <td key={c.key} className={c.right ? s.r : undefined}>{c.foot ?? ''}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
