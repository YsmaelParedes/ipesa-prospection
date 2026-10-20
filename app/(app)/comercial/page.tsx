'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch, cachedQueryData } from '@/lib/apiClient'
import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, useDataChanged } from '@/lib/crmEvents'
import { hasStreetNumber } from '@/lib/address'
import { NO_ANSWER_LIMIT, bucketOf, inQueue, queueCompare, type Bucket, type CommercialContact } from '@/lib/commercial'
import { FilterDropdown, OwnerChip, fmtPhone } from '@/components/CrmUI'
import { Select } from '@/components/Select'
import { CallPanel } from './CallPanel'
import { ControlTab } from './ControlTab'
import { Ico, StatusChip, addressOf, bizName, coloniaOf, nextLabel, personName, type CommercialData } from './ui'
import s from './comercial.module.css'

const PATH = '/api/data/commercial'
type Tab = 'hoy' | 'programados' | 'todos' | 'depurar' | 'sin_asignar' | 'control'

export default function ComercialPage() {
  // ?id= abre un contacto directo (desde el buscador o Contactos)
  return <Suspense fallback={null}><ComercialContent /></Suspense>
}

function ComercialContent() {
  const router = useRouter()
  const deepId = useSearchParams().get('id')
  const session = useSession()
  const isAdmin = !!session?.isAdmin
  const readonly = session?.store?.access === 'readonly'
  const waModule = !!session?.store?.modules.whatsapp

  const [data, setData]       = useState<CommercialData | null>(() => cachedQueryData<CommercialData>(PATH) ?? null)
  const [loading, setLoading] = useState(() => !cachedQueryData(PATH))
  useDataReady(loading, 'comercial')
  const [tab, setTab]         = useState<Tab>('hoy')
  const [scope, setScope]     = useState('mine')   // dueño/admin: 'mine' | 'all' | user_id
  const [search, setSearch]   = useState('')
  const [coloniaF, setColoniaF] = useState('Todas')
  const [segF, setSegF]       = useState('Todos')
  const [openId, setOpenId]   = useState<string | null>(null)
  const [queueIds, setQueueIds] = useState<string[] | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [toast, setToast]     = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = (msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(PATH)
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }, [])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['contact', 'commercial'], load)

  const today = data?.today ?? ''
  const uid = data?.uid ?? ''
  const salesTeam = !!data?.salesTeam
  const team = useMemo(() => data?.team ?? [], [data])
  const contacts = useMemo(() => data?.contacts ?? [], [data])

  useEffect(() => { if (deepId && data && contacts.some(c => c.id === deepId)) setOpenId(deepId) }, [deepId, data, contacts])

  // Qué contactos son "míos" para la cola. Sin reparto (Litro), el dueño trabaja también los sin asignar.
  const inScope = useCallback((c: CommercialContact) => {
    if (!isAdmin) return true
    if (scope === 'all') return true
    if (scope === 'mine') return c.owner_id === uid || (!salesTeam && c.owner_id === null)
    return c.owner_id === scope
  }, [isAdmin, scope, uid, salesTeam])

  const withBucket = useMemo(() => contacts.map(c => ({ c, b: bucketOf(c, today) as Bucket })), [contacts, today])

  const colonias = useMemo(() => Array.from(new Set(contacts.map(coloniaOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [contacts])
  const segmentos = useMemo(() => Array.from(new Set(contacts.map(c => c.segment).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')), [contacts])

  const matches = useCallback((c: CommercialContact) => {
    if (coloniaF !== 'Todas' && coloniaOf(c) !== coloniaF) return false
    if (segF !== 'Todos' && c.segment !== segF) return false
    const q = search.trim().toLowerCase()
    if (q && !`${c.name} ${c.company ?? ''} ${c.phone} ${c.email ?? ''} ${c.address ?? ''} ${c.colonia ?? ''} ${c.last_note ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }, [coloniaF, segF, search])

  const tabMatch = useCallback((t: Tab, c: CommercialContact, b: Bucket) => {
    if (t === 'sin_asignar') return c.owner_id === null
    if (!inScope(c)) return false
    if (t === 'hoy') return inQueue(b)
    if (t === 'programados') return b === 'programado'
    if (t === 'depurar') return b === 'depurar'
    return true
  }, [inScope])

  const counts = useMemo(() => {
    const out: Record<Tab, number> = { hoy: 0, programados: 0, todos: 0, depurar: 0, sin_asignar: 0, control: 0 }
    for (const { c, b } of withBucket) {
      if (!matches(c)) continue
      for (const t of ['hoy', 'programados', 'todos', 'depurar', 'sin_asignar'] as Tab[]) if (tabMatch(t, c, b)) out[t]++
    }
    return out
  }, [withBucket, matches, tabMatch])

  const filtered = useMemo(() => {
    if (tab === 'control') return []
    const list = withBucket.filter(({ c, b }) => matches(c) && tabMatch(tab, c, b)).map(x => x.c)
    if (tab === 'hoy') return list.sort(queueCompare(today))
    if (tab === 'programados') return list.sort((a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at)))
    return list.sort((a, b) => bizName(a).localeCompare(bizName(b), 'es'))
  }, [withBucket, matches, tabMatch, tab, today])

  useEffect(() => { setChecked(new Set()) }, [tab, scope, coloniaF, segF, search])

  const open = contacts.find(c => c.id === openId) ?? null
  const canWork = (c: CommercialContact) => c.owner_id === uid || (c.owner_id === null && isAdmin)
  const canAssign = isAdmin && salesTeam && !readonly
  const multiOwner = isAdmin && (scope === 'all' || tab === 'sin_asignar')

  const openContact = (c: CommercialContact) => {
    setOpenId(c.id)
    setQueueIds(tab === 'hoy' ? filtered.map(x => x.id) : null)
  }
  const closeContact = () => {
    setOpenId(null)
    setQueueIds(null)
    if (deepId) router.replace('/comercial', { scroll: false })
  }

  // Siguiente de la cola: el primero después del actual que siga pendiente hoy
  const nextInQueue = useMemo(() => {
    if (!queueIds || !openId) return null
    const at = queueIds.indexOf(openId)
    for (const id of queueIds.slice(at + 1)) {
      const c = contacts.find(x => x.id === id)
      if (c && inQueue(bucketOf(c, today)) && canWork(c)) return c
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueIds, openId, contacts, today, uid, isAdmin])

  const replaceContact = (c: CommercialContact) => {
    setData(d => d ? { ...d, contacts: d.contacts.map(x => x.id === c.id ? { ...x, ...c, owner_name: ownerName(c.owner_id) ?? x.owner_name } : x) } : d)
    notifyDataChanged('commercial')
  }
  const ownerName = (id: string | null) => (id ? team.find(m => m.user_id === id)?.name : undefined)

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allChecked = filtered.length > 0 && filtered.every(c => checked.has(c.id))

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'hoy',         label: 'Para llamar hoy', show: true },
    { key: 'programados', label: 'Programados',     show: true },
    { key: 'todos',       label: 'Todos',           show: true },
    { key: 'depurar',     label: 'Por depurar',     show: true },
    { key: 'sin_asignar', label: 'Sin asignar',     show: isAdmin && salesTeam },
    { key: 'control',     label: 'Control diario',  show: true },
  ]

  return (
    <>
      <div className="section-head">
        <h2>Sistema comercial</h2>
        {!loading && <span className="count">{counts.hoy} para llamar hoy</span>}
        {isAdmin && team.length > 1 && tab !== 'sin_asignar' && tab !== 'control' && (
          <div className="section-actions">
            <Select value={scope} onChange={setScope} aria-label="De quién" style={{ minWidth: 190 }}
              options={[
                { value: 'mine', label: salesTeam ? 'Mis contactos' : 'Mis contactos y sin asignar' },
                { value: 'all', label: 'Todo el equipo' },
                ...team.filter(m => m.user_id !== uid).map(m => ({ value: m.user_id, label: m.name })),
              ]} />
          </div>
        )}
      </div>

      <div className="status-tabs" role="tablist" aria-label="Vista del sistema comercial">
        {TABS.filter(t => t.show).map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`status-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{!loading && t.key !== 'control' && <span className="status-tab-count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {tab === 'control' ? (
        data && <ControlTab today={today} isAdmin={isAdmin} readonly={readonly} team={team} salesTeam={salesTeam} />
      ) : (
        <>
          <div className="list-controls">
            <label className="list-search">
              <Ico.search />
              <input placeholder="Buscar por negocio, teléfono, dirección o nota…" value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearch('') }} />
              {search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda">×</button>}
            </label>
            <div className="filter-bar">
              {colonias.length > 0 && (
                <FilterDropdown value={coloniaF} options={['Todas', ...colonias]} onChange={setColoniaF}
                  triggerLabel={v => v === 'Todas' ? 'Colonia' : v} optionLabel={v => v === 'Todas' ? 'Todas las colonias' : v} searchPlaceholder="Buscar colonia…" />
              )}
              {segmentos.length > 0 && (
                <FilterDropdown value={segF} options={['Todos', ...segmentos]} onChange={setSegF}
                  triggerLabel={v => v === 'Todos' ? 'Segmento' : v} optionLabel={v => v === 'Todos' ? 'Todos los segmentos' : v} searchPlaceholder="Buscar segmento…" />
              )}
              {(coloniaF !== 'Todas' || segF !== 'Todos') && (
                <button className="filter-pill" onClick={() => { setColoniaF('Todas'); setSegF('Todos') }}>Limpiar filtros</button>
              )}
            </div>
          </div>

          {tab === 'depurar' && !loading && (
            <div className={s.notice}>Contactos que no entran a la cola: sin dirección con calle y número, o con el número equivocado. Corrige el dato y vuelven solos.</div>
          )}

          {canAssign && checked.size > 0 && (
            <AssignBar ids={Array.from(checked)} team={team} uid={uid}
              onDone={(n, msg) => { setChecked(new Set()); showToast(msg); if (n) { load(); notifyDataChanged('commercial') } }} />
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
              <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              {search.trim() || coloniaF !== 'Todas' || segF !== 'Todos' ? 'Ningún contacto coincide con estos filtros.'
                : tab === 'hoy' ? (isAdmin && salesTeam && scope === 'mine' && counts.sin_asignar > 0
                  ? <>No tienes llamadas pendientes. Hay {counts.sin_asignar} contactos sin asignar: <button className="link-btn" onClick={() => setTab('sin_asignar')}>repártelos</button>.</>
                  : 'No tienes llamadas pendientes para hoy.')
                : tab === 'programados' ? 'No hay seguimientos programados.'
                : tab === 'depurar' ? 'No hay contactos por depurar.'
                : tab === 'sin_asignar' ? 'Todos los contactos tienen responsable.'
                : isAdmin ? 'Todavía no hay contactos.' : 'Todavía no tienes contactos asignados. Pídele al dueño que te reparta.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {canAssign && (
                      <th style={{ width: 44, paddingRight: 0 }}>
                        <input type="checkbox" className={s.check} checked={allChecked} aria-label="Seleccionar todos"
                          onChange={() => setChecked(allChecked ? new Set() : new Set(filtered.map(c => c.id)))} />
                      </th>
                    )}
                    <th>Negocio</th>
                    <th>Colonia</th>
                    <th>Contacto</th>
                    <th>Teléfono</th>
                    <th className="col-secondary">Dirección</th>
                    <th className="col-secondary">Correo</th>
                    <th>Próximo seguimiento</th>
                    <th className="col-secondary">Notas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const next = nextLabel(c.next_action_at, today)
                    const isChecked = checked.has(c.id)
                    const addr = addressOf(c)
                    return (
                      <tr key={c.id} onClick={() => openContact(c)} style={{ background: isChecked ? 'var(--brand-softer)' : undefined }}>
                        {canAssign && (
                          <td style={{ width: 44, paddingRight: 0 }} onClick={e => { e.stopPropagation(); toggle(c.id) }}>
                            <input type="checkbox" className={s.check} checked={isChecked} onChange={() => {}} aria-label={`Seleccionar ${bizName(c)}`} style={{ pointerEvents: 'none' }} />
                          </td>
                        )}
                        <td>
                          <div className={s.biz}>
                            <div className={s.nm}>{bizName(c)}</div>
                            <div className={s.sub}>
                              <StatusChip value={c.commercial_status} />
                              {multiOwner && (c.owner_name ? <OwnerChip value={c.owner_name} small /> : <span className="cell-muted">Sin asignar</span>)}
                              {c.no_answer_streak >= NO_ANSWER_LIMIT && <span className={s.lowPriority}>{c.no_answer_streak} sin respuesta</span>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Colonia">{coloniaOf(c) || <span className="cell-muted">—</span>}</td>
                        <td data-label="Contacto">{personName(c) || <span className="cell-muted">—</span>}</td>
                        <td data-label="Teléfono" className="cell-mono" style={{ whiteSpace: 'nowrap' }}>{fmtPhone(c.phone)}</td>
                        <td data-label="Dirección" className="col-secondary">
                          {addr ? <span className={s.clip} title={addr}>{addr}{!hasStreetNumber(c.address) ? ' · sin número' : ''}</span> : <span className="cell-muted">Sin dirección</span>}
                        </td>
                        <td data-label="Correo" className="col-secondary">{c.email ? <span className={s.clip}>{c.email}</span> : <span className="cell-muted">—</span>}</td>
                        <td data-label="Próximo seguimiento">
                          <div className={s.nextCell}>
                            <span className={`follow-chip ${next.tone}`}>{next.tone === 'none' && !c.last_activity_at ? 'Sin llamar' : next.label}</span>
                            {c.next_action_at && c.next_action && <span className={s.nextAction}>{c.next_action}</span>}
                          </div>
                        </td>
                        <td data-label="Notas" className="col-secondary">{c.last_note ? <span className={s.note} title={c.last_note}>{c.last_note}</span> : <span className="cell-muted">—</span>}</td>
                        <td className="cell-chevron" style={{ width: 36, textAlign: 'right' }}><Ico.chevron /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {open && (
        <CallPanel key={open.id} contact={open} today={today} canWork={canWork(open)} readonly={readonly} waModule={waModule}
          onClose={closeContact}
          onChanged={c => { replaceContact(c); showToast('Guardado') }}
          onNext={nextInQueue ? () => setOpenId(nextInQueue.id) : undefined}
          nextName={nextInQueue ? bizName(nextInQueue) : undefined} />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}

/* ── Reparto: asignar a una persona o repartir en partes iguales ── */
function AssignBar({ ids, team, uid, onDone }: {
  ids: string[]; team: { user_id: string; name: string; role: string }[]; uid: string
  onDone: (updated: number, msg: string) => void
}) {
  const [owner, setOwner] = useState('')
  const [splitOpen, setSplitOpen] = useState(false)
  const [split, setSplit] = useState<Set<string>>(() => new Set(team.filter(m => m.role === 'employee').map(m => m.user_id)))
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState('')

  const send = async (body: Record<string, unknown>, label: string) => {
    setBusy(true); setError('')
    let updated = 0
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await apiFetch('/api/data/commercial/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, ids: ids.slice(i, i + 500) }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setError(d.error || 'No se pudo asignar'); return }
        updated += d.updated ?? 0
      }
      onDone(updated, `${updated} contacto${updated !== 1 ? 's' : ''} ${label}`)
    } finally { setBusy(false) }
  }

  return (
    <div className={s.assignBar}>
      <span>{ids.length} seleccionado{ids.length !== 1 ? 's' : ''}</span>
      <Select value={owner} onChange={setOwner} aria-label="Asignar a" placeholder="Asignar a…" style={{ minWidth: 180 }}
        options={team.map(m => ({ value: m.user_id, label: m.user_id === uid ? `${m.name} (tú)` : m.name }))} />
      <button className="btn btn-primary" disabled={!owner || busy} onClick={() => send({ owner }, 'asignados')}>Asignar</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => setSplitOpen(o => !o)}>Repartir en partes iguales</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => send({ owner: null }, 'sin asignar')}>Quitar responsable</button>
      {splitOpen && (
        <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div className={s.splitList}>
            {team.map(m => (
              <label key={m.user_id}>
                <input type="checkbox" checked={split.has(m.user_id)}
                  onChange={() => setSplit(prev => { const n = new Set(prev); if (n.has(m.user_id)) n.delete(m.user_id); else n.add(m.user_id); return n })} />
                {m.user_id === uid ? `${m.name} (tú)` : m.name}
              </label>
            ))}
          </div>
          <button className="btn btn-primary" disabled={!split.size || busy} onClick={() => send({ split: Array.from(split) }, `repartidos entre ${split.size}`)}>
            Repartir entre {split.size}
          </button>
        </div>
      )}
      {error && <div className="field-error" style={{ flexBasis: '100%' }}>{error}</div>}
    </div>
  )
}
