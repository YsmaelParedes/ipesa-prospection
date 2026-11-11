'use client'

import { useDataReady, useQueryEffect, useCachedQuery } from '@/lib/useCachedQuery'


import { cachedQueryData, apiFetch } from '@/lib/apiClient'


import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, TrendIcon, Donut, segColor } from '@/components/CrmUI'
import { StatusChip, fmtDay, nextLabel } from '@/components/CommercialUI'
import { useSession } from '@/lib/profile'
import { reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { fmtAgo, fmtDue, greetingFor, isDueToday, isOverdue } from '@/lib/datetime'
import { WhatsAppIcon } from '@/components/icons'
import { AlarmClock, Target, PartyPopper, Check, Phone, MessageCircle, Store, Mail, Pencil } from 'lucide-react'

type Trend = { current: number; previous: number }

/** Comparativo real contra el mes anterior. */
function trendOf(t: Trend | undefined, unit: 'count' | 'pts' = 'count'): { up: boolean; delta: string; note: string } | null {
  if (!t) return null
  const diff = t.current - t.previous
  if (unit === 'pts') return { up: diff >= 0, delta: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} pts`, note: 'vs mes anterior' }
  if (t.previous === 0) return t.current > 0 ? { up: true, delta: `+${t.current}`, note: 'este mes' } : null
  const pct = Math.round((diff / t.previous) * 100)
  return { up: diff >= 0, delta: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`, note: 'vs mes anterior' }
}

const toIsoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const money = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const FIRST_STEPS = [
  { id: 'wa',    href: '/configuracion?tab=whatsapp', title: 'Conecta tu WhatsApp',    text: 'Atiende a tus clientes desde el número de tu tienda.' },
  { id: 'cli',   href: '/contactos',                  title: 'Agrega tus clientes',     text: 'Uno por uno o importa tu lista de Excel.' },
  { id: 'team',  href: '/configuracion?tab=equipo',   title: 'Invita a tu equipo',      text: 'Cada vendedor entra con su propio acceso.' },
  { id: 'com',   href: '/comercial',                  title: 'Haz tu primera llamada', text: 'Anota el resultado y la próxima fecha de cada cliente.' },
]

function FirstSteps({ whatsapp }: { whatsapp: boolean }) {
  const steps = FIRST_STEPS.filter(st => whatsapp || st.id !== 'wa')
  return (
    <section className="first-steps">
      <div className="first-steps-head">
        <div>
          <h2>Primeros pasos</h2>
          <p>Deja lista tu tienda en unos minutos. Este cuadro desaparece cuando registres tu primer cliente.</p>
        </div>
      </div>
      <div className="first-steps-grid">
        {steps.map((st, i) => (
          <Link key={st.id} href={st.href} className="first-step">
            <span className="first-step-num">{i + 1}</span>
            <strong>{st.title}</strong>
            <span>{st.text}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const router  = useRouter()
  const session = useSession()
  const waUsage = useCachedQuery<{ people24h: number | null; dailyLimit: number | null }>(session?.isAdmin && session.store?.modules.whatsapp ? '/api/data/dashboard/whatsapp' : null)
  const [data, setData]           = useState<any>(() => cachedQueryData('/api/data/dashboard?includeWhatsApp=0') ?? null)
  const [loading, setLoading]     = useState(() => !cachedQueryData('/api/data/dashboard?includeWhatsApp=0'))
  useDataReady(loading, 'dashboard')
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const [now, setNow]             = useState(() => new Date())

  const loadDashboard = useCallback(() => {
    apiFetch('/api/data/dashboard?includeWhatsApp=0')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])
  const loadReminders = useCallback(() => {
    apiFetch('/api/data/reminders')
      .then(r => (r.ok ? r.json() : { reminders: [] }))
      .then(d => { setReminders((d.reminders ?? []).filter((r: Reminder) => !r.completado)); setNow(new Date()) })
      .catch(() => setReminders([]))
  }, [])

  useQueryEffect(() => { loadDashboard(); loadReminders() }, [loadDashboard, loadReminders])
  useDataChanged(['reminder', 'contact', 'commercial'], () => { loadDashboard(); loadReminders() })

  const completeReminder = async (id: string) => {
    const r = await apiFetch(`/api/data/reminders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: true }),
    })
    if (r.ok) { setReminders(prev => prev?.filter(x => x.id !== id) ?? null); notifyDataChanged('reminder') }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const m = data?.metrics ?? {}
  const t = data?.trends ?? {}
  const wa = data?.whatsapp
  const readonly = session?.store?.access === 'readonly'
  const waModule = !session?.store || session.store.modules.whatsapp

  const segmentsAll: any[] = data?.bySegment ?? []
  const segTop = segmentsAll.slice(0, 6).map((s: any, i: number) => ({ ...s, color: segColor(i) }))
  const segRest = segmentsAll.slice(6).reduce((sum: number, s: any) => sum + s.count, 0)
  const bySegment = segRest > 0 ? [...segTop, { name: `Otros (${segmentsAll.length - 6})`, count: segRest, color: '#B8B8B7' }] : segTop
  const segTotal = segmentsAll.reduce((s: number, d: any) => s + d.count, 0) || 1

  const byResult: any[] = data?.byResult ?? []
  const maxRes = Math.max(...byResult.map((c: any) => c.count), 1)
  const byOwner: any[] = data?.byOwner ?? []
  const maxOwner = Math.max(...byOwner.map((o: any) => o.count), 1)
  const upcoming: any[] = data?.upcoming ?? []
  const activity: any[] = data?.activity ?? []
  const queue = data?.queue ?? { count: 0, contacts: [] }
  const todayIso = toIsoDay(now)

  const due = (reminders ?? []).filter(r => isDueToday(r.fecha_recordatorio, now))
  const overdueCount = due.filter(r => isOverdue(r.fecha_recordatorio, now)).length
  const firstName = (session?.user.name || '').split(/\s+/)[0]

  return (
    <>
      <div className="dash-hello">
        <div>
          <h2>{greetingFor(now)}{firstName ? `, ${firstName}` : ''}</h2>
          <p>{now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}{session?.store ? ` · ${session.store.name}` : ''}</p>
        </div>
      </div>

      {/* Tienda nueva: guía de arranque para quien la administra */}
      {session?.isAdmin && session.store && (m.totalContacts ?? 0) === 0 && (
        <FirstSteps whatsapp={session.store.modules.whatsapp} />
      )}

      {/* ── Para hoy: lo que tiene pendientes va primero (un cliente esperando en WhatsApp, lo más urgente) ── */}
      <div className="today-grid">
        <section className="today-card" style={{ order: due.length ? 1 : 3 }}>
          <header className="today-head">
            <span className="today-icon tone-amber"><AlarmClock size={19} /></span>
            <div>
              <h3>Para hoy</h3>
              <p>{reminders === null ? 'Cargando…' : due.length ? `${due.length} recordatorio${due.length !== 1 ? 's' : ''}${overdueCount ? ` · ${overdueCount} vencido${overdueCount !== 1 ? 's' : ''}` : ''}` : 'Nada pendiente para hoy'}</p>
            </div>
            <Link href="/recordatorios" className="today-link">Agenda →</Link>
          </header>
          {reminders !== null && due.length === 0 ? (
            <div className="today-empty">
              <span className="with-icon">Todo al día. <PartyPopper size={15} style={{ color: 'var(--brand)' }} /></span>
              {!readonly && <button className="link-btn" onClick={() => openQuickCreate({ kind: 'reminder' })}>Programar un recordatorio</button>}
            </div>
          ) : (
            <ul className="today-list">
              {due.slice(0, 5).map(r => {
                const overdue = isOverdue(r.fecha_recordatorio, now)
                const subject = reminderSubject(r)
                return (
                  <li key={r.id} className="today-row">
                    <span className="today-dot" style={{ background: overdue ? 'var(--brand)' : 'var(--warning-fill)' }} />
                    <span className="today-main">
                      <strong>{reminderTitle(r)}</strong>
                      <small style={overdue ? { color: 'var(--brand)' } : undefined}>
                        {fmtDue(r.fecha_recordatorio, now)}
                        {subject && <> · {subject}</>}
                      </small>
                    </span>
                    {!readonly && <button className="notif-done with-icon" onClick={() => completeReminder(r.id)}><Check size={12} strokeWidth={3} /> Listo</button>}
                  </li>
                )
              })}
              {due.length > 5 && <li className="today-more"><Link href="/recordatorios">Ver {due.length - 5} más en la Agenda →</Link></li>}
            </ul>
          )}
        </section>

        <section className="today-card" style={{ order: queue.count ? 2 : 4 }}>
          <header className="today-head">
            <span className="today-icon tone-brand"><Target size={19} /></span>
            <div>
              <h3>Llamadas para hoy</h3>
              <p>{queue.count ? `${queue.count} por llamar${m.overdue ? ` · ${m.overdue} vencida${m.overdue !== 1 ? 's' : ''}` : ''}` : 'Sin llamadas pendientes'}</p>
            </div>
            <Link href="/comercial" className="today-link">Sistema comercial →</Link>
          </header>
          {queue.contacts.length === 0 ? (
            <div className="today-empty">
              {(m.totalContacts ?? 0) === 0 ? 'Agrega tus clientes para empezar a llamar.' : 'Todo al día: no hay llamadas pendientes para hoy.'}
            </div>
          ) : (
            <ul className="today-list">
              {queue.contacts.map((c: any) => (
                <li key={c.id} className="today-row">
                  <Avatar name={c.name} size={28} />
                  <span className="today-main">
                    <Link href={`/comercial?id=${c.id}`}><strong>{c.name}</strong></Link>
                    <small style={c.overdue ? { color: 'var(--brand)' } : undefined}>
                      <StatusChip value={c.status} /> {c.fresh && !c.next_action_at ? 'Sin llamar' : `${c.next_action || 'Dar seguimiento'} · ${nextLabel(c.next_action_at, todayIso).label}`}
                    </small>
                  </span>
                </li>
              ))}
              {queue.count > queue.contacts.length && (
                <li className="today-more"><Link href="/comercial">Ver las {queue.count} en el sistema comercial →</Link></li>
              )}
            </ul>
          )}
        </section>

        {wa && waModule && (
          <Link href="/whatsapp" className="today-card today-card-wa" style={{ order: wa.unreadConversations ? 0 : 5 }}>
            <header className="today-head">
              <span className="today-icon tone-wa">
                <WhatsAppIcon size={18} />
              </span>
              <div>
                <h3>WhatsApp</h3>
                <p>{wa.unreadConversations > 0 ? `${wa.unreadConversations} chat${wa.unreadConversations !== 1 ? 's' : ''} sin leer` : 'Bandeja al día'}</p>
              </div>
              <span className="today-link">Abrir →</span>
            </header>
            <div className="today-wa-stats">
              <div><strong className={wa.unreadConversations ? 'hot' : ''}>{wa.unreadConversations}</strong><span>sin leer</span></div>
              <div><strong>{wa.inboundToday}</strong><span>recibidos hoy</span></div>
              {data?.isAdmin && <div><strong>{waUsage.data?.people24h ?? '—'}{waUsage.data?.dailyLimit != null && <small>/{waUsage.data.dailyLimit.toLocaleString('es-MX')}</small>}</strong><span>personas 24 h</span></div>}
            </div>
          </Link>
        )}
      </div>

      {/* ── Cifras ── */}
      <div className="kpi-grid">
        <KpiCard label="Contactos" value={(m.totalContacts ?? 0).toLocaleString('es-MX')} color="var(--c-cyan)"
          note={m.newContactsMonth ? `+${m.newContactsMonth} este mes` : 'Sin altas este mes'} />
        <KpiCard label="Para llamar hoy" value={m.queueToday ?? 0} color="var(--brand)"
          note={m.overdue ? `${m.overdue} vencida${m.overdue !== 1 ? 's' : ''}` : 'Ninguna vencida'} />
        <KpiCard label="Cotizaciones del mes" value={m.quotesMonth ?? 0} color="var(--c-magenta)"
          note={m.quotedMonth ? `${money(m.quotedMonth)} cotizado` : 'Sin montos cotizados'} />
        <KpiCard label="Ventas del mes" value={m.salesMonth ?? 0} color="var(--success-fill)" trend={trendOf(t.sales)} hint="ventas registradas" />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Resultados de llamadas</div>
            <span className="panel-sub">últimos 30 días</span>
            <Link href="/comercial" className="panel-action">Ver sistema →</Link>
          </div>
          {byResult.length === 0 ? (
            <p className="panel-empty">Sin llamadas registradas en los últimos 30 días</p>
          ) : (
            <div className="barchart">
              {byResult.map((r: any, i: number) => {
                const color = segColor(i)
                return (
                  <div className="bar-row" key={r.key}>
                    <div className="bar-label"><span className="dot" style={{ background: color }}></span>{r.name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.count / maxRes) * 100}%`, background: color }}></div></div>
                    <div className="bar-value">{r.count}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Clientes por segmento</div>
            <Link href="/contactos" className="panel-action">Ver contactos →</Link>
          </div>
          {bySegment.length === 0 ? (
            <p className="panel-empty">Sin segmentos aún</p>
          ) : (
            <div className="donut-wrap">
              <Donut data={bySegment.map((s: any) => ({ label: s.name, value: s.count, color: s.color }))} />
              <div className="donut-legend">
                {bySegment.map((d: any) => (
                  <div className="donut-legend-item" key={d.name}>
                    <span className="dot" style={{ background: d.color, borderRadius: 3 }}></span>
                    <span className="lname">{d.name}</span>
                    <span className="lval">{d.count}</span>
                    <span className="lpct">{Math.round((d.count / segTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Supervisión de equipo: solo tiene sentido con 2+ vendedores */}
      {data?.isAdmin && byOwner.length > 1 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <div className="panel-title">Llamadas y visitas por persona</div>
            <span className="panel-sub">últimos 30 días</span>
          </div>
          <div className="barchart">
            {byOwner.map((o: any) => (
              <div className="bar-row" key={o.name}>
                <div className="bar-label"><span className="dot" style={{ background: 'var(--ink-2)' }}></span>{o.name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(o.count / maxOwner) * 100}%`, background: 'var(--ink-2)' }}></div></div>
                <div className="bar-value">{o.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Próximos seguimientos</div>
            <Link href="/comercial" className="panel-action">Ver todos →</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="panel-empty">Sin seguimientos programados después de hoy</p>
          ) : (
            <table className="table" style={{ marginTop: -4 }}>
              <thead>
                <tr>
                  <th>Negocio</th>
                  <th>Estado</th>
                  <th>Qué sigue</th>
                  <th style={{ textAlign: 'right' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((c: any) => (
                  <tr key={c.id} onClick={() => router.push(`/comercial?id=${c.id}`)}>
                    <td>
                      <div className="cell-name">
                        <Avatar name={c.name} size={28} />
                        <span className="nm" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      </div>
                    </td>
                    <td data-label="Estado"><StatusChip value={c.status} /></td>
                    <td data-label="Qué sigue" className="cell-muted">{c.next_action || 'Dar seguimiento'}</td>
                    <td data-label="Fecha" className="cell-muted" style={{ textAlign: 'right' }}>{fmtDay(c.next_action_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Actividad reciente</div>
            <span className="panel-sub">últimas 2 semanas</span>
          </div>
          {activity.length === 0 ? (
            <p className="panel-empty">Aquí verás las llamadas, visitas y ventas que registre tu equipo.</p>
          ) : (
            <div>
              {activity.map((a: any) => (
                <Link className="activity-row" key={a.id} href={`/comercial?id=${a.contactId}`}>
                  <div className="activity-icon" style={ACTIVITY_TONE[a.type] ?? ACTIVITY_TONE.default}>
                    <ActivityIcon type={a.type} />
                  </div>
                  <div className="activity-text">
                    <strong>{a.title}</strong> · {a.contactName}
                    {a.amount ? <span className="activity-amount"> {money(Number(a.amount))}</span> : null}
                    {a.text && <div className="activity-desc">{a.text}</div>}
                    <div className="activity-time">{fmtAgo(a.at, now)}{a.who ? ` · ${a.who}` : ''}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function KpiCard({ label, value, color, trend, hint, note }: {
  label: string; value: React.ReactNode; color: string
  trend?: { up: boolean; delta: string; note: string } | null; hint?: string; note?: string
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span className="kpi-dot" style={{ background: color }}></span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {note ? (
        <div className="kpi-trend"><span>{note}</span></div>
      ) : trend ? (
        <div className={`kpi-trend ${trend.up ? 'up' : 'down'}`} title={hint ? `${hint}: comparación contra el mes anterior` : undefined}>
          <TrendIcon up={trend.up} />
          <span className="delta">{trend.delta}</span>
          <span>{trend.note}</span>
        </div>
      ) : (
        <div className="kpi-trend"><span>Sin datos del mes anterior</span></div>
      )}
      <div className="kpi-stripe" style={{ background: color }}></div>
    </div>
  )
}

const ACTIVITY_TONE: Record<string, React.CSSProperties> = {
  llamada:  { background: 'var(--c-cyan-soft)',    color: 'var(--c-cyan-ink)' },
  whatsapp: { background: '#E3F7EA',               color: '#128C4A' },
  visita:   { background: 'var(--c-teal-soft)',    color: 'var(--c-teal-ink)' },
  correo:   { background: '#E0F4F8',               color: '#00708A' },
  nota:     { background: 'var(--paper-2)',        color: 'var(--muted)' },
  close:    { background: 'var(--success-soft)',   color: 'var(--success)' },
  default:  { background: 'var(--brand-soft)',     color: 'var(--brand)' },
}

function ActivityIcon({ type }: { type?: string }) {
  const Ico = ({ llamada: Phone, whatsapp: MessageCircle, visita: Store, correo: Mail, close: Check } as Record<string, typeof Phone>)[type ?? ''] ?? Pencil
  return <Ico size={15} strokeWidth={type === 'close' ? 2.4 : 2} />
}
