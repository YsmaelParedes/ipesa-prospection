'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ══════════════════════════════════════════════════════════
   TIPOS
══════════════════════════════════════════════════════════ */
type Colourant = {
  code: string
  shotsPerLiter: number | null
  mlPerLiter: number | null
  needsReview: boolean
}

type FormulaColor = {
  code: string
  name: string
  base: string
  colourants: Colourant[]
}

type CatalogSummary = { id: string; productLine: string; fandeck: string; colorCount: number }

type CatalogResponse = {
  id: string
  productLine: string
  fandeck: string
  colorCount: number
  matchCount: number
  colors: FormulaColor[]
}

type VolumeUnit = 'ml' | 'L'

const PRESETS: { label: string; sub: string; liters: number }[] = [
  { label: 'Litro',  sub: '1 L',  liters: 1 },
  { label: 'Galón',  sub: '4 L',  liters: 4 },
  { label: 'Cubeta', sub: '19 L', liters: 19 },
]

function fmtMl(v: number | null): string {
  if (v == null) return '—'
  if (v < 10) return v.toFixed(2)
  if (v < 100) return v.toFixed(1)
  return Math.round(v).toString()
}

/* ══════════════════════════════════════════════════════════
   PÁGINA
══════════════════════════════════════════════════════════ */
export default function FormulasPage() {
  const [catalogs, setCatalogs]     = useState<CatalogSummary[]>([])
  const [catalogId, setCatalogId]   = useState<string>('')
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<FormulaColor[]>([])
  const [matchCount, setMatchCount] = useState(0)
  const [loading, setLoading]       = useState(false)
  const [selected, setSelected]     = useState<FormulaColor | null>(null)

  const [volumeValue, setVolumeValue] = useState<string>('1')
  const [volumeUnit, setVolumeUnit]   = useState<VolumeUnit>('L')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Catálogos disponibles */
  useEffect(() => {
    fetch('/api/formulas')
      .then(r => r.json())
      .then(d => {
        setCatalogs(d.catalogs || [])
        if (d.catalogs?.[0]) setCatalogId(d.catalogs[0].id)
      })
      .catch(() => {})
  }, [])

  const runSearch = useCallback((id: string, q: string) => {
    if (!id) return
    setLoading(true)
    fetch(`/api/formulas/${id}?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then((d: CatalogResponse) => {
        setResults(d.colors || [])
        setMatchCount(d.matchCount ?? 0)
      })
      .catch(() => { setResults([]); setMatchCount(0) })
      .finally(() => setLoading(false))
  }, [])

  /* Búsqueda con debounce */
  useEffect(() => {
    if (!catalogId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(catalogId, query), 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [catalogId, query, runSearch])

  const liters = useMemo(() => {
    const n = Number(volumeValue.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return 0
    return volumeUnit === 'ml' ? n / 1000 : n
  }, [volumeValue, volumeUnit])

  const activeCatalog = catalogs.find(c => c.id === catalogId)

  return (
    <>
      <div className="section-head">
        <h2>Fórmulas</h2>
        <span className="count">
          {activeCatalog ? `${activeCatalog.productLine} · ${activeCatalog.fandeck} · ${activeCatalog.colorCount} colores` : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* ── Columna izquierda: búsqueda + resultados ── */}
        <div className="panel" style={{ padding: 16 }}>
          <div className="search-input" style={{ marginBottom: 12 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)', flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              placeholder="Buscar por nombre o código (ej. AB238-1, Red Planet)…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
            />
            {query && (
              <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
            )}
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {loading ? 'Buscando…' : query ? `${matchCount} resultado${matchCount !== 1 ? 's' : ''}` : `Primeros ${results.length} colores`}
          </div>

          <div style={{ maxHeight: 560, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.map(c => {
              const isActive = selected?.code === c.code
              const hasWarning = c.colourants.some(cn => cn.needsReview)
              return (
                <button
                  key={c.code}
                  onClick={() => setSelected(c)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                    border: `1px solid ${isActive ? 'var(--ipesa-orange)' : 'var(--line)'}`,
                    background: isActive ? 'var(--ipesa-orange-soft)' : 'var(--card)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)' }}>{c.code}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>Base {c.base}</span>
                  {hasWarning && (
                    <span title="Alguna cantidad de este color necesita verificarse contra el PDF original" style={{ color: 'var(--ipesa-rose)', fontSize: 14 }}>⚠</span>
                  )}
                </button>
              )
            })}
            {!loading && results.length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Sin resultados para "{query}"
              </div>
            )}
          </div>
        </div>

        {/* ── Columna derecha: detalle + calculadora ── */}
        <div className="panel" style={{ padding: 20, minHeight: 400 }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360, color: 'var(--muted)', fontSize: 13.5, textAlign: 'center' }}>
              Selecciona un color de la lista para ver su fórmula convertida a mL.
            </div>
          ) : (
            <>
              <div className="panel-head" style={{ marginBottom: 16 }}>
                <div>
                  <div className="panel-title">{selected.code} — {selected.name}</div>
                  <div className="panel-sub" style={{ marginLeft: 0 }}>Base {selected.base}</div>
                </div>
              </div>

              {/* Selector de volumen */}
              <div className="field" style={{ marginBottom: 18 }}>
                <label>Volumen a preparar</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {PRESETS.map(p => {
                    const active = volumeUnit === 'L' && Number(volumeValue) === p.liters
                    return (
                      <button
                        key={p.label}
                        className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setVolumeUnit('L'); setVolumeValue(String(p.liters)) }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.25, padding: '8px 14px' }}
                      >
                        <span>{p.label}</span>
                        <span style={{ fontSize: 10.5, opacity: 0.75, fontWeight: 500 }}>{p.sub}</span>
                      </button>
                    )
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={volumeValue}
                      onChange={e => setVolumeValue(e.target.value)}
                      style={{ width: 90, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 13.5, outline: 'none' }}
                    />
                    <select
                      value={volumeUnit}
                      onChange={e => setVolumeUnit(e.target.value as VolumeUnit)}
                      style={{ padding: '9px 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', fontSize: 13.5, outline: 'none' }}
                    >
                      <option value="L">Litros</option>
                      <option value="ml">mL</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Tabla de colorantes */}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Colorante</th>
                      <th>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.colourants.map((cn, i) => {
                      const ml = cn.mlPerLiter != null ? cn.mlPerLiter * liters : null
                      return (
                        <tr key={i} style={{ cursor: 'default' }}>
                          <td style={{ fontWeight: 600 }}>{cn.code}</td>
                          <td>
                            {cn.needsReview || ml == null ? (
                              <span style={{ color: 'var(--ipesa-rose)', fontWeight: 600 }} title="Este valor no cuadra en el documento fuente — verifica la fórmula original antes de usarla">
                                ⚠ Verificar fórmula original
                              </span>
                            ) : (
                              <span style={{ fontWeight: 600 }}>{fmtMl(ml)} mL</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {liters === 0 && (
                <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
                  Ingresa un volumen mayor a 0 para calcular las cantidades.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
