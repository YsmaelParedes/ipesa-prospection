'use client'

import { useMemo, useState } from 'react'
import { NO_ANSWER_LIMIT, type CommercialContact, type ResultChoice } from '@/lib/commercial'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { ContactPanel, avatarColors } from './ContactPanel'
import type { Kind } from './RegisterForm'
import { Ico, StatusChip, bizName, fmtDay, initials, money, type ListContact, type TodayData } from './ui'
import s from './comercial.module.css'

type Group = { key: 'late' | 'today' | 'fresh' | 'visit'; title: string; color: string; items: ListContact[]; total?: number }
export type Opened = { id: string; kind?: Kind; result?: ResultChoice }

function whenOf(c: ListContact, today: string): { label: string; cls: string } {
  if (!c.next_action_at) return { label: 'Nuevo', cls: s.fresh }
  if (c.next_action_at === today) return { label: 'Hoy', cls: s.soon }
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${c.next_action_at}T12:00:00Z`)) / 86_400_000)
  return { label: days === 1 ? 'Ayer' : `Hace ${days} días`, cls: s.late }
}

/**
 * "Hoy": lo vencido, lo de hoy y prospectos nuevos (sin asignar) para completar
 * la meta de llamadas. En computadora la ficha queda a la derecha con el
 * registro siempre visible; en celular se abre al picar Llamar o WhatsApp.
 */
export function HoyView({ data, wide, zone, query, readonly, waModule, loadingMore, onZone, onQuery, onMore, onSaved, opened, onOpen }: {
  data: TodayData
  wide: boolean
  zone: string
  query: string
  readonly: boolean
  waModule: boolean
  loadingMore: boolean
  onZone: (z: string) => void
  onQuery: (q: string) => void
  onMore: () => void
  onSaved: (c: CommercialContact) => void
  opened: Opened | null
  onOpen: (o: Opened | null) => void
}) {
  const { today, goals, counts } = data
  const groups: Group[] = useMemo(() => [
    { key: 'late', title: 'Vencidos', color: 'var(--brand)', items: data.due.filter(c => (c.next_action_at ?? '') < today) },
    { key: 'today', title: 'Para hoy', color: 'var(--warning-fill)', items: data.due.filter(c => c.next_action_at === today) },
    { key: 'fresh', title: 'Prospectos nuevos', color: 'var(--c-cyan-ink)', items: data.fresh, total: data.freshTotal },
    { key: 'visit', title: 'Para visita (sin teléfono)', color: 'var(--ink-3)', items: data.visit, total: data.visitTotal },
  ], [data, today])
  const all = groups.flatMap(g => g.items)

  // En computadora siempre hay alguien abierto: el elegido o el primero de la lista
  const selected = opened ?? (wide && all[0] ? { id: all[0].id } : null)
  const selectedContact = selected ? all.find(c => c.id === selected.id) : undefined
  const nextAfter = selected ? all[all.findIndex(c => c.id === selected.id) + 1] : undefined
  const callsPct = goals.calls ? Math.min(100, Math.round(counts.calls / goals.calls * 100)) : 0

  const strip = (
    <div className={`${s.elev} ${s.strip}`}>
      <div className={s.bigbar}>
        <div className={s.progressRow}>
          <span>Llamadas de hoy</span>
          <span><b className={s.num}>{counts.calls}</b> <span className={s.num} style={{ color: 'var(--muted)' }}>/ {goals.calls}</span></span>
        </div>
        <div className={s.bar} role="progressbar" aria-valuemin={0} aria-valuemax={goals.calls} aria-valuenow={counts.calls} aria-label="Llamadas de hoy">
          <span style={{ width: `${callsPct}%` }} />
        </div>
      </div>
      <div className={s.stats}>
        {([['effective', 'Efectivos'], ['quotes', 'Cotiz.'], ['followups', 'Seguim.'], ['sales', 'Ventas']] as const).map(([k, label]) => (
          <div key={k} className={s.stat}><b className={s.num}>{counts[k]}<small>/{goals[k]}</small></b>{label}</div>
        ))}
      </div>
    </div>
  )

  const filters = (
    <div className={s.filters}>
      {data.zones.length > 0 && (
        <>
          <button className={`${s.pill} ${s.press}`} aria-pressed={zone === ''} onClick={() => onZone('')}>Todas las zonas</button>
          {data.zones.map(z => <button key={z} className={`${s.pill} ${s.press}`} aria-pressed={zone === z} onClick={() => onZone(z)}>{z}</button>)}
        </>
      )}
      <label className={s.search}>
        <Ico.search />
        <input type="search" value={query} onChange={e => onQuery(e.target.value)} placeholder="Buscar negocio o teléfono" aria-label="Buscar negocio o teléfono" />
      </label>
    </div>
  )

  // Hasta 300 a la vez; con más, se acota con la zona o la búsqueda
  const moreButton = data.fresh.length < data.freshTotal && (data.fresh.length >= 300 ? (
    <p className={s.loadMore}>Elige una zona o busca para ver otros prospectos.</p>
  ) : (
    <button className={`${s.loadMore} ${s.press}`} onClick={onMore} disabled={loadingMore}>
      {loadingMore ? 'Cargando…' : `Ver más prospectos (${(data.freshTotal - data.fresh.length).toLocaleString('es-MX')} más)`}
    </button>
  ))

  const empty = !all.length && (
    <div className={s.emptyList}>
      {query || zone ? 'Nada coincide con el filtro.' : 'No tienes pendientes para hoy y ya no quedan prospectos sin asignar. ¡Buen trabajo!'}
    </div>
  )

  const tags = (c: ListContact) => (
    <span className={s.tags}>
      <StatusChip value={c.commercial_status} />
      {c.quote_amount ? <span className={s.tag}>{money(c.quote_amount)}</span> : null}
      {!c.owner_id && <span className={s.tag}>Sin asignar</span>}
      {c.no_answer_streak >= NO_ANSWER_LIMIT && <span className={`${s.tag} ${s.tagWarn}`}>No contesta · {c.no_answer_streak}</span>}
    </span>
  )
  const nextText = (c: ListContact) => [c.next_action, c.last_note && `«${c.last_note}»`].filter(Boolean).join(' · ')
  const subline = (c: ListContact) => [c.segment, c.zone].filter(Boolean).join(' · ')

  if (wide) {
    return (
      <>
        {strip}
        {filters}
        <div className={s.todayGrid}>
          <div className={`${s.elev} ${s.listCard}`}>
            {groups.map(g => g.items.length > 0 && (
              <div key={g.key}>
                <div className={s.groupHead}>
                  <span className={s.dot} style={{ background: g.color }} />{g.title}
                  <span className={`${s.count} ${s.num}`}>{g.total !== undefined ? `${g.items.length} de ${g.total.toLocaleString('es-MX')}` : g.items.length}</span>
                </div>
                {g.items.map(c => {
                  const when = whenOf(c, today)
                  const [bg, fg] = avatarColors(c.commercial_status)
                  const phone = normalizePhone(c.phone)
                  return (
                    <div key={c.id} role="button" tabIndex={0} className={s.row} aria-current={selected?.id === c.id}
                      onClick={() => onOpen({ id: c.id })} onKeyDown={e => { if (e.key === 'Enter') onOpen({ id: c.id }) }}>
                      <span className={s.avatar} style={{ background: bg, color: fg }} aria-hidden="true">{initials(bizName(c))}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className={s.name}>{bizName(c)}</span>
                        <span className={s.meta}>{subline(c) || fmtPhone(c.phone)}</span>
                      </span>
                      <span className={s.next}>{tags(c)}{nextText(c) && <span>{nextText(c)}</span>}</span>
                      <span className={`${s.when} ${when.cls}`}>{when.label}</span>
                      <span className={s.quick}>
                        {phone && <a href={`tel:${phone}`} className={`${s.qbtn} ${s.qCall} ${s.press}`} aria-label={`Llamar a ${bizName(c)}`}
                          onClick={e => { e.stopPropagation(); onOpen({ id: c.id, kind: 'llamada' }) }}><Ico.phone /></a>}
                        {waModule && phone.length === 10 && c.line_type !== 'fijo' && (
                          <button className={`${s.qbtn} ${s.qWa} ${s.press}`} aria-label={`WhatsApp a ${bizName(c)}`}
                            onClick={e => { e.stopPropagation(); onOpen({ id: c.id, kind: 'whatsapp' }) }}><Ico.chat /></button>
                        )}
                        {!phone && (
                          <button className={`${s.qbtn} ${s.actMore} ${s.press}`} aria-label={`Registrar visita a ${bizName(c)}`}
                            onClick={e => { e.stopPropagation(); onOpen({ id: c.id, kind: 'visita' }) }}><Ico.pin /></button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            {empty}
            {moreButton}
          </div>
          {selected && (
            <ContactPanel key={`${selected.id}-${selected.kind ?? ''}`} contactId={selected.id} initial={selectedContact} today={today}
              variant="pane" isAdmin={data.isAdmin} readonly={readonly} waModule={waModule}
              kind={selected.kind} result={selected.result} nextName={nextAfter ? bizName(nextAfter) : undefined}
              onSaved={c => { onSaved(c); onOpen(nextAfter && nextAfter.id !== c.id ? { id: nextAfter.id } : null) }}
              onChanged={onSaved} />
          )}
        </div>
      </>
    )
  }

  // ── Celular: tarjetas ──
  return (
    <>
      {strip}
      {filters}
      <div className={s.cards}>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.key}>
            <div className={s.cardGroup}>
              <span className={s.dot} style={{ background: g.color }} />{g.title}
              <span className={`${s.count} ${s.num}`}>{g.total !== undefined ? `${g.items.length} de ${g.total.toLocaleString('es-MX')}` : g.items.length}</span>
            </div>
            <div className={s.cards}>
              {g.items.map(c => {
                const when = whenOf(c, today)
                const [bg, fg] = avatarColors(c.commercial_status)
                const phone = normalizePhone(c.phone)
                return (
                  <article key={c.id} className={`${s.elev} ${s.card} ${g.key === 'late' ? s.cardDue : ''}`}>
                    <button className={s.cardTop} onClick={() => onOpen({ id: c.id })}>
                      <span className={s.avatar} style={{ background: bg, color: fg }} aria-hidden="true">{initials(bizName(c))}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className={s.name}>{bizName(c)}</span>
                        <span className={s.meta}>{subline(c) || fmtPhone(c.phone)}</span>
                        <span style={{ display: 'block', marginTop: 6 }}>{tags(c)}</span>
                      </span>
                      <span className={`${s.when} ${when.cls}`}>{when.label}</span>
                    </button>
                    {nextText(c) && (
                      <p className={s.cardNote}><b>Próximo:</b> {nextText(c)}{c.next_action_at && c.next_action_at !== today ? ` · ${fmtDay(c.next_action_at)}` : ''}</p>
                    )}
                    {!readonly && (
                      <div className={s.actions}>
                        {phone && <a href={`tel:${phone}`} className={`${s.act} ${s.actCall} ${s.press}`} onClick={() => onOpen({ id: c.id, kind: 'llamada' })}><Ico.phone /> Llamar</a>}
                        {waModule && phone.length === 10 && c.line_type !== 'fijo' && (
                          <button className={`${s.act} ${s.actWa} ${s.press}`} onClick={() => onOpen({ id: c.id, kind: 'whatsapp' })}><Ico.chat /> WhatsApp</button>
                        )}
                        <button className={`${s.act} ${s.actMore} ${s.press}`} aria-label={`Registrar visita a ${bizName(c)}`} onClick={() => onOpen({ id: c.id, kind: 'visita' })}><Ico.pin /></button>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
        {empty && <div className={s.elev}>{empty}</div>}
        {moreButton && <div className={s.elev}>{moreButton}</div>}
      </div>
      {opened && (
        <ContactPanel key={`${opened.id}-${opened.kind ?? ''}`} contactId={opened.id} initial={all.find(c => c.id === opened.id)} today={today}
          variant="overlay" isAdmin={data.isAdmin} readonly={readonly} waModule={waModule} kind={opened.kind} result={opened.result}
          onSaved={c => { onSaved(c); onOpen(null) }} onChanged={onSaved} onClose={() => onOpen(null)} />
      )}
    </>
  )
}
