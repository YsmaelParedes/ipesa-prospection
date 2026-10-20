'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { hasStreetNumber } from '@/lib/address'
import { NO_ANSWER_LIMIT, PRIORITIES, PRIORITY_INFO, bucketOf, type Bucket, type CommercialContact } from '@/lib/commercial'
import { FilterDropdown, OwnerChip, fmtPhone } from '@/components/CrmUI'
import { Select } from '@/components/Select'
import { Ico, PriorityChip, StatusChip, addressOf, bizName, coloniaOf, nextLabel, personName, type Member } from './ui'
import s from './comercial.module.css'

type View = 'todos' | 'programados' | 'depurar' | 'sin_asignar' | 'clientes'
const PAGE = 200

/** La base completa (hoja "Base comercial" del Excel), con filtros y reparto para el dueño. */
export function BaseTab({ contacts, inScope, today, isAdmin, salesTeam, readonly, uid, team, onOpen, onAssigned }: {
  contacts: CommercialContact[]
  inScope: (c: CommercialContact) => boolean
  today: string; isAdmin: boolean; salesTeam: boolean; readonly: boolean; uid: string; team: Member[]
  onOpen: (c: CommercialContact) => void
  onAssigned: (updated: number, msg: string) => void
}) {
  const [view, setView]       = useState<View>('todos')
  const [search, setSearch]   = useState('')
  const [coloniaF, setColoniaF] = useState('Todas')
  const [segF, setSegF]       = useState('Todos')
  const [prioF, setPrioF]     = useState('Todas')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [shown, setShown]     = useState(PAGE)

  const withBucket = useMemo(() => contacts.map(c => ({ c, b: bucketOf(c, today) as Bucket })), [contacts, today])
  const colonias = useMemo(() => Array.from(new Set(contacts.map(coloniaOf).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')), [contacts])
  const segmentos = useMemo(() => Array.from(new Set(contacts.map(c => c.segment).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es')), [contacts])

  const matches = (c: CommercialContact) => {
    if (coloniaF !== 'Todas' && coloniaOf(c) !== coloniaF) return false
    if (segF !== 'Todos' && c.segment !== segF) return false
    if (prioF !== 'Todas' && c.priority !== prioF) return false
    const q = search.trim().toLowerCase()
    if (q && !`${c.name} ${c.company ?? ''} ${c.phone} ${c.email ?? ''} ${c.address ?? ''} ${c.colonia ?? ''} ${c.last_note ?? ''}`.toLowerCase().includes(q)) return false
    return true
  }
  const viewMatch = (v: View, c: CommercialContact, b: Bucket) => {
    if (v === 'sin_asignar') return c.owner_id === null
    if (!inScope(c)) return false
    if (v === 'programados') return b === 'programado'
    if (v === 'depurar') return b === 'depurar'
    if (v === 'clientes') return c.commercial_status === 'cliente'
    return true
  }

  const VIEWS: { key: View; label: string; show: boolean }[] = [
    { key: 'todos', label: 'Todos', show: true },
    { key: 'programados', label: 'Programados', show: true },
    { key: 'depurar', label: 'Por depurar', show: true },
    { key: 'sin_asignar', label: 'Sin asignar', show: isAdmin && salesTeam },
    { key: 'clientes', label: 'Clientes', show: true },
  ]
  const counts = Object.fromEntries(VIEWS.map(v => [v.key, withBucket.filter(({ c, b }) => matches(c) && viewMatch(v.key, c, b)).length])) as Record<View, number>
  const filtered = withBucket.filter(({ c, b }) => matches(c) && viewMatch(view, c, b)).map(x => x.c)
    .sort(view === 'programados'
      ? (a, b) => String(a.next_action_at).localeCompare(String(b.next_action_at))
      : (a, b) => bizName(a).localeCompare(bizName(b), 'es'))

  useEffect(() => { setChecked(new Set()); setShown(PAGE) }, [view, search, coloniaF, segF, prioF])

  const canAssign = isAdmin && salesTeam && !readonly
  const multiOwner = isAdmin && view !== 'sin_asignar'
  const allChecked = filtered.length > 0 && filtered.every(c => checked.has(c.id))
  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const filtersOn = !!search.trim() || coloniaF !== 'Todas' || segF !== 'Todos' || prioF !== 'Todas'

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 10 }}>
        {VIEWS.filter(v => v.show).map(v => (
          <button key={v.key} className={`filter-pill ${view === v.key ? 'active' : ''}`} onClick={() => setView(v.key)}>
            {v.label}<span className="count">{counts[v.key]}</span>
          </button>
        ))}
      </div>

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
          <FilterDropdown value={prioF} options={['Todas', ...PRIORITIES]} onChange={setPrioF} searchable={false}
            triggerLabel={v => v === 'Todas' ? 'Prioridad' : `Prioridad ${PRIORITY_INFO[v as 'alta'].label.toLowerCase()}`}
            optionLabel={v => v === 'Todas' ? 'Todas las prioridades' : PRIORITY_INFO[v as 'alta'].label} />
          {(coloniaF !== 'Todas' || segF !== 'Todos' || prioF !== 'Todas') && (
            <button className="filter-pill" onClick={() => { setColoniaF('Todas'); setSegF('Todos'); setPrioF('Todas') }}>Limpiar filtros</button>
          )}
        </div>
      </div>

      {view === 'depurar' && (
        <div className={s.notice}>Contactos que no entran a la cola: sin dirección con calle y número, o con el número equivocado. Corrige el dato y vuelven solos.</div>
      )}

      {canAssign && checked.size > 0 && (
        <AssignBar ids={Array.from(checked)} team={team} uid={uid} onDone={(n, msg) => { setChecked(new Set()); onAssigned(n, msg) }} />
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          {filtersOn ? 'Ningún contacto coincide con estos filtros.'
            : view === 'programados' ? 'No hay seguimientos programados.'
            : view === 'depurar' ? 'No hay contactos por depurar.'
            : view === 'sin_asignar' ? 'Todos los contactos tienen responsable.'
            : view === 'clientes' ? 'Todavía no hay clientes con venta registrada.'
            : isAdmin ? 'Todavía no hay contactos.' : 'Todavía no tienes contactos asignados. Pídele al dueño que te reparta.'}
        </div>
      ) : (
        <>
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
                {filtered.slice(0, shown).map(c => {
                  const next = nextLabel(c.next_action_at, today)
                  const isChecked = checked.has(c.id)
                  const addr = addressOf(c)
                  return (
                    <tr key={c.id} onClick={() => onOpen(c)} style={{ background: isChecked ? 'var(--brand-softer)' : undefined }}>
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
                            <PriorityChip value={c.priority} />
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
          {filtered.length > shown && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setShown(n => n + PAGE)}>
              Ver {Math.min(PAGE, filtered.length - shown)} más de {filtered.length}
            </button>
          )}
        </>
      )}
    </div>
  )
}

/* ── Reparto: asignar a una persona o repartir en partes iguales ── */
function AssignBar({ ids, team, uid, onDone }: {
  ids: string[]; team: Member[]; uid: string
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
