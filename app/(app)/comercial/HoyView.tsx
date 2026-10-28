'use client'

import { NO_ANSWER_LIMIT, type CommercialContact, type ResultChoice } from '@/lib/commercial'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { ContactPanel, avatarColors } from './ContactPanel'
import type { Kind } from './RegisterForm'
import { Filters, Ico, StatusChip, bizName, fmtDay, initials, money, whenOf, type ListContact, type TodayData } from './ui'
import s from './comercial.module.css'

export type Opened = { id: string; kind?: Kind; result?: ResultChoice }
export type Sub = 'pend' | 'nuevos' | 'visita'
type Group = { key: string; title: string; color: string; items: ListContact[]; total?: number }

const TONE = { late: s.late, soon: s.soon, fresh: s.fresh, later: s.later }

/**
 * "Hoy" en tres partes: Pendientes (vencidos y de hoy), Nuevos (prospectos
 * sin asignar) y Para visita (sin teléfono). Con búsqueda, coincidencias en
 * toda la base. En computadora la ficha queda a la derecha con el registro
 * siempre visible; en celular se abre al picar Llamar o WhatsApp. Al guardar
 * se queda en el mismo cliente: el siguiente se elige a mano.
 */
export function HoyView({ data, wide, sub, zone, segment, query, readonly, waModule, loadingMore, onSub, onZone, onSegment, onQuery, onClear, onMore, onSaved, opened, onOpen }: {
  data: TodayData
  wide: boolean
  sub: Sub
  zone: string
  segment: string
  query: string
  readonly: boolean
  waModule: boolean
  loadingMore: boolean
  onSub: (s: Sub) => void
  onZone: (z: string) => void
  onSegment: (s: string) => void
  onQuery: (q: string) => void
  onClear: () => void
  onMore: (which: 'fresh' | 'visit') => void
  onSaved: (c: CommercialContact) => void
  opened: Opened | null
  onOpen: (o: Opened | null) => void
}) {
  const { today, goals, counts } = data
  const searching = data.found !== null && query.trim() !== ''
  const pending = data.due.length

  const groups: Group[] = searching
    ? [{ key: 'found', title: 'Resultados en toda la base', color: 'var(--ink-3)', items: data.found ?? [] }]
    : sub === 'pend'
      ? [
          { key: 'late', title: 'Vencidos', color: 'var(--brand)', items: data.due.filter(c => (c.next_action_at ?? '') < today) },
          { key: 'today', title: 'Para hoy', color: 'var(--warning-fill)', items: data.due.filter(c => c.next_action_at === today) },
        ]
      : sub === 'nuevos'
        ? [{ key: 'fresh', title: 'Sin asignar · el primero que registra se lo queda', color: 'var(--c-cyan-ink)', items: data.fresh, total: data.freshTotal }]
        : [{ key: 'visit', title: 'Sin teléfono · para visitar en persona', color: 'var(--ink-3)', items: data.visit, total: data.visitTotal }]
  const all = groups.flatMap(g => g.items)

  // En computadora siempre hay alguien abierto: el elegido o el primero de la lista
  const selected = opened ?? (wide && all[0] ? { id: all[0].id } : null)
  const selectedContact = selected ? all.find(c => c.id === selected.id) : undefined
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

  const SUBS: [Sub, string, string, number][] = [
    ['pend', 'Pendientes', 'var(--brand)', pending],
    ['nuevos', 'Nuevos', 'var(--c-cyan-ink)', data.freshTotal],
    ['visita', 'Para visita', 'var(--ink-3)', data.visitTotal],
  ]
  const subTabs = (
    <div className={s.subTabs} role="group" aria-label="Qué ver">
      {SUBS.map(([key, label, color, n]) => (
        <button key={key} type="button" className={`${s.subTab} ${s.press}`} aria-pressed={!searching && sub === key}
          onClick={() => { onSub(key); onOpen(null); if (searching) onQuery('') }}>
          <span className={s.dot} style={{ background: color }} />{label} <small className={s.num}>{n.toLocaleString('es-MX')}</small>
        </button>
      ))}
    </div>
  )

  const filters = (
    <Filters zones={data.zones} segments={data.segments ?? []} zone={zone} segment={segment} onZone={onZone} onSegment={onSegment}
      query={query} onQuery={onQuery} placeholder="Buscar en toda la base: negocio o teléfono"
      active={!!(zone || segment || query)} onClear={onClear} />
  )

  // De a 30; con más de 300, se acota con la zona, el segmento o la búsqueda
  const more = (which: 'fresh' | 'visit', shown: number, total: number) => shown < total && (shown >= 300 ? (
    <p className={s.loadMore}>Elige una zona o un segmento, o busca, para ver otros.</p>
  ) : (
    <button className={`${s.loadMore} ${s.press}`} onClick={() => onMore(which)} disabled={loadingMore}>
      {loadingMore ? 'Cargando…' : `Ver más (${(total - shown).toLocaleString('es-MX')} más)`}
    </button>
  ))
  const moreButton = searching ? null
    : sub === 'nuevos' ? more('fresh', data.fresh.length, data.freshTotal)
    : sub === 'visita' ? more('visit', data.visit.length, data.visitTotal)
    : null

  const filtered = !!(zone || segment)
  const empty = !all.length && (
    <div className={s.emptyList}>
      {searching ? 'Nadie coincide con la búsqueda en tu base.'
        : filtered ? 'Nada coincide con el filtro.'
        : sub === 'pend' ? <>No tienes pendientes para hoy.{data.freshTotal > 0 && <> <button type="button" className={s.clear} onClick={() => onSub('nuevos')}>Sigue con Nuevos</button></>}</>
        : sub === 'nuevos' ? 'Ya no quedan prospectos sin asignar. ¡Buen trabajo!'
        : 'No hay contactos sin teléfono por visitar.'}
    </div>
  )

  const ownerTag = (c: ListContact) => !c.owner_id ? 'Sin asignar' : c.owner_id === data.uid ? null : `De ${c.owner_name || 'otra persona'}`
  const tags = (c: ListContact) => (
    <span className={s.tags}>
      <StatusChip value={c.commercial_status} />
      {c.quote_amount ? <span className={s.tag}>{money(c.quote_amount)}</span> : null}
      {ownerTag(c) && <span className={s.tag}>{ownerTag(c)}</span>}
      {c.no_answer_streak >= NO_ANSWER_LIMIT && <span className={`${s.tag} ${s.tagWarn}`}>No contesta · {c.no_answer_streak}</span>}
    </span>
  )
  const nextText = (c: ListContact) => [c.next_action, c.last_note && `«${c.last_note}»`].filter(Boolean).join(' · ')
  const subline = (c: ListContact) => [c.segment, c.zone].filter(Boolean).join(' · ')
  const count = (g: Group) => g.total !== undefined ? `${g.items.length} de ${g.total.toLocaleString('es-MX')}` : g.items.length

  if (wide) {
    return (
      <>
        {strip}
        {subTabs}
        {filters}
        <div className={s.todayGrid}>
          <div className={`${s.elev} ${s.listCard}`}>
            {groups.map(g => g.items.length > 0 && (
              <div key={g.key}>
                <div className={s.groupHead}>
                  <span className={s.dot} style={{ background: g.color }} />{g.title}
                  <span className={`${s.count} ${s.num}`}>{count(g)}</span>
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
                      <span className={`${s.when} ${TONE[when.tone]}`}>{when.label}</span>
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
              variant="pane" readonly={readonly} waModule={waModule} uid={data.uid}
              kind={selected.kind} result={selected.result}
              onSaved={c => { onSaved(c); onOpen({ id: c.id }) }} />
          )}
        </div>
      </>
    )
  }

  // ── Celular: tarjetas ──
  return (
    <>
      {strip}
      {subTabs}
      {filters}
      <div className={s.cards}>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.key}>
            <div className={s.cardGroup}>
              <span className={s.dot} style={{ background: g.color }} />{g.title}
              <span className={`${s.count} ${s.num}`}>{count(g)}</span>
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
                      <span className={`${s.when} ${TONE[when.tone]}`}>{when.label}</span>
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
          variant="overlay" readonly={readonly} waModule={waModule} uid={data.uid} kind={opened.kind} result={opened.result}
          onSaved={c => { onSaved(c); onOpen(null) }} onClose={() => onOpen(null)} />
      )}
    </>
  )
}
