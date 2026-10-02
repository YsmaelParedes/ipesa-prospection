'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, CanalChip, EstadoChip, TrendIcon, Donut, canalColor, fmtDate, segColor } from '@/components/CrmUI'
import { useSession } from '@/lib/profile'
import { reminderSubject, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { fmtAgo, fmtDue, greetingFor, isDueToday, isOverdue } from '@/lib/datetime'

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

const money = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const FIRST_STEPS = [
  { id: 'wa',    href: '/configuracion?tab=whatsapp', title: 'Conecta tu WhatsApp',    text: 'Atiende y manda campañas desde el número de tu tienda.' },
  { id: 'cli',   href: '/contactos',                  title: 'Agrega tus clientes',     text: 'Uno por uno o importa tu lista de Excel.' },
  { id: 'team',  href: '/configuracion?tab=equipo',   title: 'Invita a tu equipo',      text: 'Cada vendedor entra con su propio acceso.' },
  { id: 'lead',  href: '/leads',                      title: 'Registra tu primer lead', text: 'Da seguimiento a cada cotización hasta cerrarla.' },
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
  const [data, setData]           = useState<any>(null)
  const [loading, setLoading]     = useState(true)
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const [now, setNow]             = useState(() => new Date())

  const loadDashboard = useCallback(() => {
    fetch('/api/data/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])
  const loadReminders = useCallback(() => {
    fetch('/api/data/reminders')
      .then(r => (r.ok ? r.json() : { reminders: [] }))
      .then(d => { setReminders((d.reminders ?? []).filter((r: Reminder) => !r.completado)); setNow(new Date()) })
      .catch(() => setReminders([]))
  }, [])

  useEffect(() => { loadDashboard(); loadReminders() }, [loadDashboard, loadReminders])
  useDataChanged(['reminder', 'lead', 'contact', 'activity'], () => { loadDashboard(); loadReminders() })

  const completeReminder = async (id: string) => {
    const r = await fetch(`/api/data/reminders/${id}`, {
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

  const byChannel: any[] = data?.byChannel ?? []
  const maxCh = Math.max(...byChannel.map((c: any) => c.count), 1)
  const byOwner: any[] = data?.byOwner ?? []
  const maxOwner = Math.max(...byOwner.map((o: any) => o.count), 1)
  const recentLeads: any[] = data?.recentLeads ?? []
  const activity: any[] = data?.activity ?? []
  const followUp = data?.followUp ?? { count: 0, leads: [] }

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
            <span className="today-icon tone-amber">⏰</span>
            <div>
              <h3>Para hoy</h3>
              <p>{reminders === null ? 'Cargando…' : due.length ? `${due.length} recordatorio${due.length !== 1 ? 's' : ''}${overdueCount ? ` · ${overdueCount} vencido${overdueCount !== 1 ? 's' : ''}` : ''}` : 'Nada pendiente para hoy'}</p>
            </div>
            <Link href="/recordatorios" className="today-link">Agenda →</Link>
          </header>
          {reminders !== null && due.length === 0 ? (
            <div className="today-empty">
              Todo al día. 🎉
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
                        {subject && <> · {r.lead_id ? <Link href={`/leads?id=${r.lead_id}`}>{subject}</Link> : subject}</>}
                      </small>
                    </span>
                    {!readonly && <button className="notif-done" onClick={() => completeReminder(r.id)}>✓ Listo</button>}
                  </li>
                )
              })}
              {due.length > 5 && <li className="today-more"><Link href="/recordatorios">Ver {due.length - 5} más en la Agenda →</Link></li>}
            </ul>
          )}
        </section>

        <section className="today-card" style={{ order: followUp.count ? 2 : 4 }}>
          <header className="today-head">
            <span className="today-icon tone-brand">🎯</span>
            <div>
              <h3>Leads sin seguimiento</h3>
              <p>{followUp.count ? `${followUp.count} abierto${followUp.count !== 1 ? 's' : ''} sin próxima llamada o visita` : 'Todos tus leads abiertos tienen seguimiento'}</p>
            </div>
            <Link href="/leads" className="today-link">Leads →</Link>
          </header>
          {followUp.leads.length === 0 ? (
            <div className="today-empty">
              {(m.leadsActivos ?? 0) === 0 ? 'No tienes leads abiertos.' : 'Bien hecho: cada lead abierto tiene su siguiente paso.'}
              {!readonly && (m.leadsActivos ?? 0) === 0 && <button className="link-btn" onClick={() => openQuickCreate({ kind: 'lead' })}>Registrar un lead</button>}
            </div>
          ) : (
            <ul className="today-list">
              {followUp.leads.map((l: any) => (
                <li key={l.id} className="today-row">
                  <Avatar name={l.name} size={28} />
                  <span className="today-main">
                    <Link href={`/leads?id=${l.id}`}><strong>{l.name}</strong></Link>
                    <small><EstadoChip value={l.estado} small />{l.monto ? ` ${money(Number(l.monto))}` : ''}</small>
                  </span>
                  {!readonly && (
                    <button className="today-action" onClick={() => openQuickCreate({
                      kind: 'reminder',
                      defaults: { lead_id: l.id, lead_name: l.name, type: 'call', nota: `Dar seguimiento a ${String(l.name).split(/\s+/)[0]}` },
                    })}>
                      Programar
                    </button>
                  )}
                </li>
              ))}
              {followUp.count > followUp.leads.length && (
                <li className="today-more"><Link href="/leads">Ver los {followUp.count} en Leads →</Link></li>
              )}
            </ul>
          )}
        </section>

        {wa && waModule && (
          <Link href="/whatsapp" className="today-card today-card-wa" style={{ order: wa.unreadConversations ? 0 : 5 }}>
            <header className="today-head">
              <span className="today-icon tone-wa">
                <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18} aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z" /></svg>
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
              {data?.isAdmin && <div><strong>{wa.templates24h}<small>/{wa.dailyLimit}</small></strong><span>plantillas 24 h</span></div>}
            </div>
          </Link>
        )}
      </div>

      {/* ── Cifras ── */}
      <div className="kpi-grid">
        <KpiCard label="Contactos" value={(m.totalContacts ?? 0).toLocaleString('es-MX')} color="var(--c-cyan)"
          note={m.newContactsMonth ? `+${m.newContactsMonth} este mes` : 'Sin altas este mes'} />
        <KpiCard label="Leads abiertos" value={m.leadsActivos ?? 0} color="var(--brand)"
          note={m.openValue ? `${money(m.openValue)} en juego` : 'Sin valor estimado'} />
        <KpiCard label="Cierres del mes" value={m.cierresMes ?? 0} color="var(--success-fill)" trend={trendOf(t.wins)} hint="ventas ganadas" />
        <KpiCard label="Conversión" value={`${m.conversion ?? 0}%`} color="var(--c-magenta)" trend={trendOf(t.conversion, 'pts')} hint="leads ganados" />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Leads por canal</div>
            <span className="panel-sub">últimos 30 días</span>
            <Link href="/leads" className="panel-action">Ver leads →</Link>
          </div>
          {byChannel.length === 0 ? (
            <p className="panel-empty">Sin leads en los últimos 30 días</p>
          ) : (
            <div className="barchart">
              {byChannel.map((ch: any) => {
                const color = canalColor(ch.name)
                return (
                  <div className="bar-row" key={ch.name}>
                    <div className="bar-label"><span className="dot" style={{ background: color }}></span>{ch.name}</div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(ch.count / maxCh) * 100}%`, background: color }}></div></div>
                    <div className="bar-value">{ch.count}</div>
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
            <div className="panel-title">Leads por vendedor</div>
            <span className="panel-sub">supervisión de equipo</span>
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
            <div className="panel-title">Leads recientes</div>
            <Link href="/leads" className="panel-action">Ver todos →</Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="panel-empty">
              Sin leads aún{!readonly && <> · <button className="link-btn" onClick={() => openQuickCreate({ kind: 'lead' })}>Registrar el primero</button></>}
            </p>
          ) : (
            <table className="table" style={{ marginTop: -4 }}>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Canal</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((l: any) => (
                  <tr key={l.id} onClick={() => router.push(`/leads?id=${l.id}`)}>
                    <td>
                      <div className="cell-name">
                        <Avatar name={l.name} size={28} />
                        <span className="nm" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                      </div>
                    </td>
                    <td data-label="Canal"><CanalChip value={l.canal} small /></td>
                    <td data-label="Estado"><EstadoChip value={l.estado} small /></td>
                    <td data-label="Fecha" className="cell-muted" style={{ textAlign: 'right' }}>{fmtDate(l.fecha)}</td>
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
            <p className="panel-empty">Aquí verás las llamadas, cotizaciones y visitas que registres en cada lead.</p>
          ) : (
            <div>
              {activity.map((a: any) => (
                <Link className="activity-row" key={a.id} href={a.leadId ? `/leads?id=${a.leadId}` : '/leads'}>
                  <div className="activity-icon" style={ACTIVITY_TONE[a.type] ?? ACTIVITY_TONE.default}>
                    <ActivityIcon type={a.type} />
                  </div>
                  <div className="activity-text">
                    <strong>{a.title}</strong> · {a.leadName}
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
  call:     { background: 'var(--c-cyan-soft)',    color: 'var(--c-cyan-ink)' },
  email:    { background: 'var(--c-magenta-soft)', color: 'var(--c-magenta-ink)' },
  whatsapp: { background: '#E3F7EA',               color: '#128C4A' },
  quote:    { background: 'var(--warning-soft)',   color: 'var(--warning)' },
  meeting:  { background: 'var(--c-purple-soft)',  color: 'var(--c-purple-ink)' },
  visit:    { background: 'var(--c-teal-soft)',    color: 'var(--c-teal-ink)' },
  close:    { background: 'var(--success-soft)',   color: 'var(--success)' },
  default:  { background: 'var(--brand-soft)',     color: 'var(--brand)' },
}

function ActivityIcon({ type }: { type?: string }) {
  const s = { width: 15, height: 15 }
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: s }
  switch (type) {
    case 'call':     return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>
    case 'email':    return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>
    case 'whatsapp': return <svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.38 8.38 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z" /></svg>
    case 'quote':    return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
    case 'meeting':  return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></svg>
    case 'visit':    return <svg {...p}><path d="M3 9 4.5 4h15L21 9" /><path d="M3 9h18v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9Z" /><path d="M5 13v7h14v-7" /></svg>
    case 'close':    return <svg {...p} strokeWidth={2.4}><path d="m5 13 4 4L19 7" /></svg>
    case 'lead':     return <svg {...p} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
    default:         return <svg {...p}><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
  }
}
