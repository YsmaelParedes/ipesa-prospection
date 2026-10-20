'use client'

import { useCallback, useState } from 'react'
import { apiFetch } from '@/lib/apiClient'
import { useQueryEffect } from '@/lib/useCachedQuery'
import { useDataChanged } from '@/lib/crmEvents'
import { GOAL_KEYS, GOAL_LABELS, NO_ANSWER_LIMIT, type CallResult, type CommercialContact, type DayCounts, type Goals } from '@/lib/commercial'
import { fmtPhone, normalizePhone } from '@/lib/phone'
import { OwnerChip } from '@/components/CrmUI'
import { Ico, PriorityChip, StatusChip, addressOf, bizName, coloniaOf, nextLabel, personName } from './ui'
import s from './comercial.module.css'

const QUICK: { result: CallResult; label: string }[] = [
  { result: 'interes', label: 'Interés' },
  { result: 'cotizacion', label: 'Cotización' },
  { result: 'venta', label: 'Venta' },
  { result: 'reprogramar', label: 'Reprogramar' },
]
const PAGE = 30

/** Meta del día de quien está viendo (solo con reparto: Galón, Cubeta, Interno). */
function GoalsStrip({ today, uid, isAdmin }: { today: string; uid: string; isAdmin: boolean }) {
  const [data, setData] = useState<{ goals: Goals; counts: DayCounts } | null>(null)
  const load = useCallback(async () => {
    const q = new URLSearchParams({ date: today, ...(isAdmin ? { user: uid } : {}) })
    const r = await apiFetch(`/api/data/commercial/control?${q}`).catch(() => null)
    if (!r?.ok) return
    const d = await r.json()
    setData({ goals: d.goals, counts: d.people?.[0]?.counts ?? d.day })
  }, [today, uid, isAdmin])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['commercial'], load)
  if (!data) return null
  return (
    <>
      <div className={s.sectionLabel}>Tu meta de hoy</div>
      <div className={s.goalsStrip}>
        {GOAL_KEYS.map(k => {
          const goal = data.goals[k], done = data.counts[k]
          return (
            <div key={k} className={`${s.goalMini} ${goal > 0 && done >= goal ? s.goalDone : ''}`}>
              <small>{GOAL_LABELS[k]}</small>
              <b>{done}<span>/{goal}</span></b>
              <div className="progress-bar" aria-hidden="true"><div className="progress-fill" style={{ width: `${goal ? Math.min(100, (done / goal) * 100) : 0}%` }} /></div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export function HoyTab({ queue, today, uid, isAdmin, salesTeam, readonly, unassigned, canWork, onOpen, onNoAnswer, onGoTo }: {
  queue: CommercialContact[]; today: string; uid: string; isAdmin: boolean; salesTeam: boolean; readonly: boolean
  /** Contactos sin responsable (para avisar al dueño que reparta). */
  unassigned: number
  canWork: (c: CommercialContact) => boolean
  onOpen: (c: CommercialContact, result?: CallResult) => void
  onNoAnswer: (c: CommercialContact) => Promise<void>
  onGoTo: (tab: 'base') => void
}) {
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState<string | null>(null)
  const overdue = queue.filter(c => c.next_action_at && c.next_action_at < today).length

  return (
    <div>
      {salesTeam && <GoalsStrip today={today} uid={uid} isAdmin={isAdmin} />}

      <div className={s.sectionLabel}>
        Para llamar ahora · {queue.length} pendiente{queue.length !== 1 ? 's' : ''}{overdue ? ` · ${overdue} vencido${overdue !== 1 ? 's' : ''}` : ''}
      </div>

      {queue.length === 0 ? (
        <div className="empty-state">
          {unassigned > 0
            ? <>No tienes llamadas pendientes. Hay {unassigned} contactos sin asignar: <button className="link-btn" onClick={() => onGoTo('base')}>repártelos en Base comercial</button>.</>
            : 'No tienes llamadas pendientes para hoy.'}
        </div>
      ) : (
        <div className={s.cards}>
          {queue.slice(0, shown).map(c => {
            const next = nextLabel(c.next_action_at, today)
            const phone = normalizePhone(c.phone)
            const person = personName(c)
            const colonia = coloniaOf(c)
            const works = canWork(c) && !readonly
            return (
              <article key={c.id} className={s.qCard}>
                <div className={s.qTop}>
                  <button className={s.qMain} onClick={() => onOpen(c)}>
                    <span className={s.qName}>{bizName(c)}</span>
                    <span className={s.qChips}>
                      <span className={`follow-chip ${next.tone}`}>{next.tone === 'none' ? 'Nuevo · nunca llamado' : `${next.label}${c.next_action ? ` · ${c.next_action}` : ''}`}</span>
                      {c.commercial_status !== 'nuevo' && <StatusChip value={c.commercial_status} />}
                      <PriorityChip value={c.priority} />
                      {isAdmin && c.owner_name && c.owner_id !== uid && <OwnerChip value={c.owner_name} small />}
                      {c.no_answer_streak >= NO_ANSWER_LIMIT && <span className={s.lowPriority}>{c.no_answer_streak} sin respuesta</span>}
                    </span>
                    <span className={s.qMeta}>{[person, colonia, fmtPhone(c.phone)].filter(Boolean).join(' · ')}</span>
                    {!c.last_note && addressOf(c) && <span className={s.qMeta}>{addressOf(c)}</span>}
                    {c.last_note && <span className={s.qNote}>“{c.last_note}”</span>}
                  </button>
                  {phone && <a href={`tel:${phone}`} className={`btn btn-ghost btn-ghost-call ${s.qCall}`}><Ico.phone /> Llamar</a>}
                </div>
                {works && (
                  <div className={s.qActions} role="group" aria-label={`Resultado de la llamada a ${bizName(c)}`}>
                    <button className={s.qBtn} disabled={busy === c.id}
                      onClick={async () => { setBusy(c.id); try { await onNoAnswer(c) } finally { setBusy(null) } }}>
                      {busy === c.id ? 'Guardando…' : 'No contesta'}
                    </button>
                    {QUICK.map(q => <button key={q.result} className={s.qBtn} onClick={() => onOpen(c, q.result)}>{q.label}</button>)}
                    <button className={s.qBtn} onClick={() => onOpen(c)}>Más…</button>
                  </div>
                )}
              </article>
            )
          })}
          {queue.length > shown && (
            <button className="btn btn-ghost btn-block" onClick={() => setShown(n => n + PAGE)}>Ver {Math.min(PAGE, queue.length - shown)} más</button>
          )}
        </div>
      )}
    </div>
  )
}
