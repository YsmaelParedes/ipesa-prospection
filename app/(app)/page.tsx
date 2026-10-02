'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar, CanalChip, EstadoChip, TrendIcon, Donut, canalColor, fmtDate, segColor } from '@/components/IpesaUI'
import { getDisplayName } from '@/lib/profile'

type Trend = { current: number; previous: number }

/** Comparativo real contra el mes anterior (antes eran porcentajes fijos de muestra). */
function trendOf(t: Trend | undefined, unit: 'count' | 'pts' = 'count'): { up: boolean; delta: string; note: string } | null {
  if (!t) return null
  const diff = t.current - t.previous
  if (unit === 'pts') return { up: diff >= 0, delta: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} pts`, note: 'vs mes anterior' }
  if (t.previous === 0) return t.current > 0 ? { up: true, delta: `+${t.current}`, note: 'este mes' } : null
  const pct = Math.round((diff / t.previous) * 100)
  return { up: diff >= 0, delta: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`, note: 'vs mes anterior' }
}

function greeting(name: string): { text: string; emoji: string } {
  const h = new Date().getHours()
  if (h >= 6  && h < 12) return { text: `¡Buenos días, ${name}!`,   emoji: '☀️' }
  if (h >= 12 && h < 19) return { text: `¡Buenas tardes, ${name}!`, emoji: '🎨' }
  return                         { text: `¡Buenas noches, ${name}!`, emoji: '🌙' }
}

export default function DashboardPage() {
  const router = useRouter()
  const [data,        setData]        = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    fetch('/api/data/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getDisplayName().then(setDisplayName)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const m = data?.metrics ?? {}
  const bySegment: any[] = (data?.bySegment ?? []).map((s: any, i: number) => ({ ...s, color: s.color || segColor(i) }))
  const byChannel: any[] = data?.byChannel ?? []
  const byOwner: any[] = data?.byOwner ?? []
  const recentLeads: any[] = data?.recentLeads ?? []
  const activity: any[] = data?.activity ?? []
  const isAdmin = !!data?.isAdmin
  const maxOwner = Math.max(...byOwner.map((o: any) => o.count), 1)

  const maxCh = Math.max(...byChannel.map((c: any) => c.count), 1)
  const segTotal = bySegment.reduce((s: number, d: any) => s + d.count, 0) || 1

  const g = displayName ? greeting(displayName) : null
  const t = data?.trends ?? {}
  const wa = data?.whatsapp

  return (
    <>
      {/* Saludo personalizado */}
      {g && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          padding: '18px 22px', background: 'var(--card)',
          border: '1px solid var(--line)', borderRadius: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: 32, lineHeight: 1 }}>{g.emoji}</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>
              {g.text}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
              Aquí tienes el resumen de hoy en IPESA Pinturas
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Contactos totales"  value={m.totalContacts ?? 0}    trend={trendOf(t.contacts)}          hint="nuevos contactos" color="var(--c-cyan)" />
        <KpiCard label="Leads activos"      value={m.leadsActivos  ?? 0}    trend={trendOf(t.leads)}             hint="leads nuevos"     color="var(--brand)" />
        <KpiCard label="Cierres del mes"    value={m.cierresMes    ?? 0}    trend={trendOf(t.wins)}              hint="ventas ganadas"   color="var(--success-fill)" />
        <KpiCard label="Tasa de conversión" value={`${m.conversion ?? 0}%`} trend={trendOf(t.conversion, 'pts')} hint="del mes"          color="var(--c-magenta)" />
      </div>

      {/* WhatsApp */}
      {wa && (
        <Link href="/whatsapp" className="dash-wa">
          <span className="dash-wa-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22} aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>
          </span>
          <span className="dash-wa-main">
            <strong>{wa.unreadConversations > 0 ? `${wa.unreadConversations} conversación${wa.unreadConversations !== 1 ? 'es' : ''} sin leer` : 'Bandeja de WhatsApp al día'}</strong>
            <span>{wa.inboundToday} mensaje{wa.inboundToday !== 1 ? 's' : ''} recibido{wa.inboundToday !== 1 ? 's' : ''} hoy{isAdmin ? ` · ${wa.templates24h} de ${wa.dailyLimit} plantillas usadas en 24 h` : ''}</span>
          </span>
          <span className="dash-wa-cta">Abrir bandeja →</span>
        </Link>
      )}

      {/* Row 1 */}
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Leads por canal de adquisición</div>
            <span className="panel-sub">últimos 30 días</span>
            <Link href="/leads" className="panel-action">Ver detalle →</Link>
          </div>
          {byChannel.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin datos de canal aún</p>
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
            <div className="panel-title">Por segmento</div>
            <span className="panel-sub">distribución</span>
          </div>
          {bySegment.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin segmentos aún</p>
          ) : (
            <div className="donut-wrap">
              <Donut data={bySegment.map(s => ({ label: s.name, value: s.count, color: s.color }))} />
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

      {/* Row admin: desglose por vendedor */}
      {isAdmin && byOwner.length > 0 && (
        <div className="dash-grid">
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
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
        </div>
      )}

      {/* Row 2 */}
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Leads recientes</div>
            <span className="panel-sub">{recentLeads.length} más recientes</span>
            <Link href="/leads" className="panel-action">Ver todos →</Link>
          </div>
          {recentLeads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin leads aún · <Link href="/leads" style={{ color: 'var(--ipesa-orange)', fontWeight: 600 }}>Crear primero</Link></p>
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
            <span className="panel-sub">hoy</span>
          </div>
          {activity.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin actividad registrada</p>
          ) : (
            <div>
              {activity.map((a: any, i: number) => (
                <div className="activity-row" key={a.id ?? i}>
                  <div className="activity-icon" style={a.type === 'close'
                    ? { background: 'var(--success-soft)', color: 'var(--success)' }
                    : { background: 'var(--brand-soft)', color: 'var(--brand)' }}>
                    <ActivityIcon type={a.type} />
                  </div>
                  <div className="activity-text">
                    <strong>{a.who}</strong> {a.what}
                    <div className="activity-time">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function KpiCard({ label, value, trend, hint, color }: {
  label: string; value: any; trend: { up: boolean; delta: string; note: string } | null; hint: string; color: string
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span className="kpi-dot" style={{ background: color }}></span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {trend ? (
        <div className={`kpi-trend ${trend.up ? 'up' : 'down'}`} title={`${hint}: comparación contra el mes anterior`}>
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

function ActivityIcon({ type }: { type?: string }) {
  if (type === 'lead') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M12 5v14M5 12h14"/></svg>
  if (type === 'close') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="m5 13 4 4L19 7"/></svg>
  if (type === 'contact') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
}
