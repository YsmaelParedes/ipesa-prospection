'use client'

import { useMemo } from 'react'
import { PIPELINE_STAGES, STAGE_PROBABILITY, STATUS_INFO, daysSince, type CommercialContact } from '@/lib/commercial'
import { OwnerChip } from '@/components/CrmUI'
import { PriorityChip, bizName, money, nextLabel } from './ui'
import s from './comercial.module.css'

const STALE_DAYS = 7
const PER_COLUMN = 40

/**
 * Oportunidades abiertas por etapa (como la hoja "Seguimiento" del Excel):
 * potencial mensual, probabilidad de la etapa, días sin contacto y próxima acción.
 */
export function SeguimientoTab({ contacts, today, multiOwner, onOpen }: {
  contacts: CommercialContact[]; today: string; multiOwner: boolean
  onOpen: (c: CommercialContact) => void
}) {
  const columns = useMemo(() => PIPELINE_STAGES.map(stage => {
    const list = contacts.filter(c => c.commercial_status === stage)
      .sort((a, b) => String(a.next_action_at ?? '9999').localeCompare(String(b.next_action_at ?? '9999')))
    const potential = list.reduce((t, c) => t + (Number(c.potential_monthly) || 0), 0)
    return { stage, list, potential, weighted: potential * (STAGE_PROBABILITY[stage] ?? 0) }
  }), [contacts])
  const inPlay = columns.reduce((t, c) => t + c.weighted, 0)

  return (
    <div>
      <div className={s.sectionLabel}>
        Oportunidades abiertas{inPlay > 0 ? ` · ${money(Math.round(inPlay))} en juego (potencial × probabilidad)` : ''}
      </div>
      <div className="kanban" style={{ '--kanban-cols': columns.length } as React.CSSProperties}>
        {columns.map(col => {
          const info = STATUS_INFO[col.stage]
          const prob = STAGE_PROBABILITY[col.stage]
          return (
            <div className="kanban-col" key={col.stage}>
              <div className="kanban-head">
                <span className="chip" style={{ fontSize: 11, padding: '3px 8px', background: info.bg, color: info.color, fontWeight: 700 }}>
                  {col.stage === 'cliente' ? 'Cliente · recompra' : info.label}
                </span>
                <span className="kcount">{col.list.length}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '0 2px 6px', fontWeight: 500 }}>
                {col.potential > 0 ? `${money(col.potential)}/mes${prob ? ` · ${Math.round(prob * 100)}%` : ''}` : prob ? `Probabilidad ${Math.round(prob * 100)}%` : 'Clientes con recompra'}
              </div>
              {col.list.slice(0, PER_COLUMN).map(c => {
                const idle = daysSince(c.last_activity_at, today)
                const next = nextLabel(c.next_action_at, today)
                return (
                  <div className="lead-card" key={c.id} onClick={() => onOpen(c)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') onOpen(c) }}>
                    <div className="lc-name">{bizName(c)}</div>
                    <div className="lc-meta">
                      {c.potential_monthly ? `${money(c.potential_monthly)}/mes` : 'Sin potencial'}
                      {idle !== null ? ` · ${idle === 0 ? 'contacto hoy' : `${idle} día${idle !== 1 ? 's' : ''} sin contacto`}` : ''}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                      {c.next_action_at
                        ? <span className={`follow-chip ${next.tone}`}>{col.stage === 'cliente' ? `Recompra · ${next.label}` : next.label}</span>
                        : <span className="follow-chip none">Sin próxima acción</span>}
                      {idle !== null && idle >= STALE_DAYS && col.stage !== 'cliente' && <span className="follow-chip overdue">Se enfría</span>}
                      <PriorityChip value={c.priority} />
                    </div>
                    {multiOwner && <div>{c.owner_name ? <OwnerChip value={c.owner_name} small /> : <span className="cell-muted">Sin asignar</span>}</div>}
                  </div>
                )
              })}
              {col.list.length > PER_COLUMN && <div className="cell-muted" style={{ fontSize: 12, padding: 4 }}>y {col.list.length - PER_COLUMN} más en Base comercial</div>}
              {col.list.length === 0 && <div className="cell-muted" style={{ fontSize: 12, padding: 4 }}>Nadie en esta etapa.</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
