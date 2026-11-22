'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, Plus, Search } from 'lucide-react'
import { useSession } from '@/lib/profile'
import { openQuickCreate } from '@/lib/crmEvents'
import { useCachedQuery } from '@/lib/useCachedQuery'
import { fmtMoney, folioLabel } from '@/lib/quotes'
import { Select } from '@/components/Select'
import { LoadFailed } from '@/components/LoadFailed'
import { SkText } from '@/components/Skeleton'
import { QuoteRowsSkeleton } from './Skeletons'
import { StatusBadge, shortDay, viewedAt, type Quote } from './ui'
import s from './cotizaciones.module.css'

type ListData = {
  quotes: Quote[]; truncated: boolean; today: string
  stats: { quoted: number; accepted: number; sentCount: number; acceptedCount: number }
}
type Member = { user_id: string; display_name: string; status: string }

const productCount = (q: Quote) => {
  if (q.file) return q.file.mime === 'application/pdf' ? 'PDF subido' : 'Foto subida'
  const n = q.items.filter(i => i.description.trim()).length
  return n ? `${n} producto${n === 1 ? '' : 's'}` : 'Sin productos'
}

const FILTERS = [
  { key: '', label: 'Todas' },
  { key: 'draft', label: 'Borradores' },
  { key: 'sent', label: 'Enviadas' },
  { key: 'accepted', label: 'Aceptadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'expired', label: 'Vencidas' },
] as const

/**
 * Cotizaciones: las cifras del mes, la lista con filtros y el botón para
 * hacer una nueva. El vendedor ve las suyas; un administrador, las de todos.
 */
export default function CotizacionesPage() {
  const session = useSession()
  const isAdmin = !!session?.isAdmin
  const readonly = session?.store?.access === 'readonly'
  const [status, setStatus] = useState('')
  const [seller, setSeller] = useState('')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  // Busca cuando dejas de escribir (no una petición por letra)
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])

  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (seller) params.set('user', seller)
  if (query) params.set('q', query)
  const { data, error, loading, reload } = useCachedQuery<ListData>(`/api/data/quotes${params.size ? `?${params}` : ''}`)
  const { data: team } = useCachedQuery<{ members: Member[] }>(isAdmin ? '/api/store/members' : null)
  const sellers = useMemo(() => (team?.members ?? []).filter(m => m.status === 'active'), [team])

  // Las cifras solo dependen del vendedor: al cambiar de estado o buscar, se quedan las de antes
  const lastStats = useRef<{ key: string; value: ListData['stats'] } | null>(null)
  if (data?.stats) lastStats.current = { key: seller, value: data.stats }
  const stats = data?.stats ?? (lastStats.current?.key === seller ? lastStats.current.value : undefined)
  const rate = stats && stats.sentCount ? Math.round((stats.acceptedCount / stats.sentCount) * 100) : null
  const filtered = !!(status || seller || query)

  return (
    <>
      <div className={s.head}>
        <h2>Cotizaciones</h2>
        {!readonly && (
          <div className={s.headActions}>
            <button className={`btn btn-primary ${s.press}`} onClick={() => openQuickCreate({ kind: 'quote' })}><Plus aria-hidden="true" /> Nueva cotización</button>
          </div>
        )}
      </div>

      <div className={s.stats}>
        <div className={s.stat}>
          <small>Cotizado este mes</small>
          <strong>{stats ? fmtMoney(stats.quoted) : <SkText w={110} />}</strong>
          <span>{stats ? `${stats.sentCount} enviada${stats.sentCount === 1 ? '' : 's'}` : <SkText w={70} />}</span>
        </div>
        <div className={s.stat}>
          <small>Aceptado este mes</small>
          <strong>{stats ? fmtMoney(stats.accepted) : <SkText w={110} />}</strong>
          <span>{stats ? `${stats.acceptedCount} aceptada${stats.acceptedCount === 1 ? '' : 's'}` : <SkText w={70} />}</span>
        </div>
        <div className={s.stat}>
          <small>Aceptación</small>
          <strong>{!stats ? <SkText w={60} /> : rate === null ? '—' : `${rate} %`}</strong>
          <span>{!stats ? <SkText w={120} /> : stats.sentCount ? 'de las enviadas este mes' : 'Aún no hay enviadas este mes'}</span>
        </div>
      </div>

      <div className={s.controls}>
        <div className={s.chips} role="group" aria-label="Estado">
          {FILTERS.map(f => (
            <button key={f.key} className={`${s.chip} ${s.press}`} aria-pressed={status === f.key} onClick={() => setStatus(f.key)}>{f.label}</button>
          ))}
        </div>
        {isAdmin && sellers.length > 1 && (
          <div className={s.seller}>
            <Select value={seller} onChange={setSeller} aria-label="Vendedor"
              options={[{ value: '', label: 'Todo el equipo' }, ...sellers.map(m => ({ value: m.user_id, label: m.display_name }))]} />
          </div>
        )}
        <label className={s.search}>
          <Search aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente o folio" aria-label="Buscar cliente o folio" />
        </label>
      </div>

      {loading ? (
        <QuoteRowsSkeleton />
      ) : error && !data ? (
        <LoadFailed message={error.message || 'No se pudieron cargar las cotizaciones'} onRetry={reload} />
      ) : !data?.quotes.length ? (
        <div className={s.empty}>
          <div className={s.mark}><FileText aria-hidden="true" /></div>
          <h3>{filtered ? 'Sin cotizaciones con ese filtro' : 'Todavía no hay cotizaciones'}</h3>
          <p>{filtered ? 'Prueba con otro estado o búsqueda.' : 'Arma una con tus productos y precios, o sube una que ya hiciste, y mándala por WhatsApp o correo.'}</p>
          {!filtered && !readonly && <button className="btn btn-primary" onClick={() => openQuickCreate({ kind: 'quote' })}><Plus aria-hidden="true" /> Nueva cotización</button>}
        </div>
      ) : (
        <>
          <div className={s.list}>
            {data.quotes.map(qt => (
              <div key={qt.id} className={s.row}>
                <div className={s.folio}>{qt.folio ? folioLabel(qt.folio) : 'Subida'}<small>{shortDay(qt.issued_on)}</small></div>
                <div className={s.client}>
                  <Link href={`/cotizaciones/${qt.id}`} className={s.rowLink}><b>{qt.client_name.trim() || 'Sin cliente'}</b></Link>
                  <small>
                    {[isAdmin && qt.seller_name, qt.viewed_at ? `Vista el ${viewedAt(qt.viewed_at)}` : null,
                      qt.status === 'sent' && !qt.viewed_at ? 'Sin abrir' : null].filter(Boolean).join(' · ') || productCount(qt)}
                  </small>
                </div>
                <div className={s.amount}>{fmtMoney(qt.total)}</div>
                <div className={s.statusCell}><StatusBadge status={qt.display_status} /></div>
              </div>
            ))}
          </div>
          {data.truncated && <p className={s.more}>Se muestran las 300 más recientes. Usa la búsqueda para encontrar una más antigua.</p>}
        </>
      )}
    </>
  )
}
