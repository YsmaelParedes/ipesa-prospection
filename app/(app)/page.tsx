'use client'

import { useEffect, useState } from 'react'
import { Avatar, CanalChip, EstadoChip, SegmentoChip, TrendIcon, Donut, fmtDate, segColor } from '@/components/IpesaUI'

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/data/dashboard')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
      <div style={{ width: 36, height: 36, border: '3px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  const m = data?.metrics ?? {}
  const bySegment: any[] = (data?.bySegment ?? []).map((s: any, i: number) => ({ ...s, color: s.color || segColor(s.name, i) }))
  const byChannel: any[] = data?.byChannel ?? []
  const recentLeads: any[] = data?.recentLeads ?? []
  const activity: any[] = data?.activity ?? []

  const maxCh = Math.max(...byChannel.map((c: any) => c.count), 1)
  const segTotal = bySegment.reduce((s: number, d: any) => s + d.count, 0) || 1

  const CANAL_COLORS: Record<string, string> = {
    'Referido': '#3D8B5C', 'Visita a Tienda': '#EE5A24', 'WhatsApp': '#25D366',
    'Redes Sociales': '#B6589C', 'Campaña Pagada': '#1F3A5F', 'Otro': '#80766B',
  }

  return (
    <>
      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Contactos totales"  value={m.totalContacts  ?? 0} trend="up"   delta="+8%"  color="#1F3A5F" />
        <KpiCard label="Leads activos"      value={m.leadsActivos   ?? 0} trend="up"   delta="+14%" color="#EE5A24" />
        <KpiCard label="Cierres del mes"    value={m.cierresMes     ?? 0} trend="up"   delta="+25%" color="#3D8B5C" />
        <KpiCard label="Tasa de conversión" value={`${m.conversion ?? 0}%`} trend="down" delta="−3%" color="#F2B544" />
      </div>

      {/* Row 1 */}
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Leads por canal de adquisición</div>
            <span className="panel-sub">últimos 30 días</span>
            <a href="/leads" className="panel-action">Ver detalle →</a>
          </div>
          {byChannel.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin datos de canal aún</p>
          ) : (
            <div className="barchart">
              {byChannel.map((ch: any) => {
                const color = CANAL_COLORS[ch.name] || '#80766B'
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

      {/* Row 2 */}
      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Leads recientes</div>
            <span className="panel-sub">{recentLeads.length} más recientes</span>
            <a href="/leads" className="panel-action">Ver todos →</a>
          </div>
          {recentLeads.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Sin leads aún · <a href="/leads" style={{ color: 'var(--ipesa-orange)', fontWeight: 600 }}>Crear primero</a></p>
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
                  <tr key={l.id} onClick={() => window.location.href = '/leads'}>
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
                <div className="activity-row" key={i}>
                  <div className="activity-icon" style={{ background: (a.color || '#EE5A24') + '22', color: a.color || '#EE5A24' }}>
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

function KpiCard({ label, value, trend, delta, color }: { label: string; value: any; trend: 'up' | 'down'; delta: string; color: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span className="kpi-dot" style={{ background: color }}></span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-trend ${trend}`}>
        <TrendIcon up={trend === 'up'} />
        <span className="delta">{delta}</span>
        <span>vs mes anterior</span>
      </div>
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
