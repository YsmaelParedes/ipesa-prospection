'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PLANS, STATUS_LABELS, planOf, storeAccess, type StoreStatus } from '@/lib/stores'
import {
  ago, countStores, expiresSoon, fmtDate as fmt, isLapsed, isOff, subscriptionLine, usePlatformStores, type PlatformStore,
} from '../data'
import s from '../admin.module.css'

/**
 * Panel del dueño › Tiendas: todas las tiendas, su prueba o suscripción y
 * acciones manuales (activar, extender prueba, suspender). /admin/tiendas?tienda=<id>
 * abre directo la ficha de esa tienda (enlaces desde el Resumen).
 */

type StoreRow = PlatformStore
type Filter = 'all' | 'trial' | 'active' | 'expiring' | 'readonly' | 'off'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const STATUS_CLS: Record<StoreStatus, string> = { trial: s.bTrial, active: s.bActive, suspended: s.bDanger, cancelled: s.bMuted }

export default function StoresPage() {
  return <Suspense><StoresList /></Suspense>
}

function StoresList() {
  const router = useRouter()
  const params = useSearchParams()
  const { stores, error, reload: load } = usePlatformStores()
  const [query, setQuery]   = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  // Ficha pedida por la URL (?tienda=<id>)
  const wanted = params.get('tienda')
  useEffect(() => { if (wanted) setOpenId(wanted) }, [wanted])
  const closeDrawer = () => {
    setOpenId(null)
    if (wanted) router.replace('/admin/tiendas', { scroll: false })
  }

  const counts = useMemo(() => countStores(stores ?? []), [stores])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (stores ?? []).filter(st => {
      const matches = !q || [st.name, st.slug, st.owner_email, st.owner_name, st.city, st.state].some(v => v?.toLowerCase().includes(q))
      if (!matches) return false
      switch (filter) {
        case 'trial': return st.status === 'trial' && storeAccess(st) === 'full'
        case 'active': return st.status === 'active' && storeAccess(st) === 'full'
        case 'expiring': return expiresSoon(st)
        case 'readonly': return isLapsed(st)
        case 'off': return isOff(st)
        default: return true
      }
    })
  }, [stores, query, filter])

  const open = stores?.find(st => st.id === openId) ?? null
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' }, { id: 'trial', label: 'En prueba' }, { id: 'active', label: 'Activas' },
    { id: 'expiring', label: 'Por vencer' }, { id: 'readonly', label: 'Solo lectura' }, { id: 'off', label: 'Suspendidas' },
  ]

  return (
    <div className={s.page}>
      {/* Los totales están en el Resumen; aquí cada filtro lleva su número */}
      <div className="section-head"><h2>Tiendas</h2></div>

      <div className={s.toolbar}>
        <div className={s.search}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar tienda, dueño o ciudad" aria-label="Buscar tiendas" />
        </div>
        <div className={s.filters} role="tablist" aria-label="Filtrar tiendas">
          {FILTERS.map(f => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={cx(s.filter, filter === f.id && s.filterOn)} onClick={() => setFilter(f.id)}>
              {f.label}{stores && <span>{counts[f.id]}</span>}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={s.error}>{error}</div>}
      {!stores && !error && <div className={s.center}><span className={s.spinner} /></div>}

      {stores && (
        <div className={s.table}>
          <div className={cx(s.tr, s.th)}>
            <span>Tienda</span>
            <span>Dueño</span>
            <span>Suscripción</span>
            <span>Uso</span>
            <span>Actividad</span>
          </div>
          {visible.length === 0 && <div className={s.empty}>No hay tiendas con ese filtro.</div>}
          {visible.map(st => {
            const readonly = storeAccess(st) === 'readonly'
            return (
              <button key={st.id} className={s.tr} onClick={() => setOpenId(st.id)}>
                <span className={s.cellStore}>
                  <strong>{st.name}</strong>
                  <small>{[st.city, st.state].filter(Boolean).join(', ') || st.slug}{!st.onboarding_completed_at && ' · configurando'}</small>
                </span>
                <span className={s.cellOwner}>
                  <strong>{st.owner_name || '—'}</strong>
                  <small>{st.owner_email || 'Sin dueño'}</small>
                </span>
                <span className={s.cellSub}>
                  <span className={s.badges}>
                    <em className={cx(s.badge, STATUS_CLS[st.status])}>{STATUS_LABELS[st.status]}</em>
                    {readonly && st.status !== 'suspended' && st.status !== 'cancelled' && <em className={cx(s.badge, s.bDanger)}>Solo lectura</em>}
                    {expiresSoon(st) && <em className={cx(s.badge, s.bWarn)}>Por vencer</em>}
                  </span>
                  <small>{subscriptionLine(st)}</small>
                </span>
                <span className={s.cellUse}>
                  <span title="Usuarios activos">{st.members}/{planOf(st.plan).maxUsers} usuarios</span>
                  <span title="Contactos y leads">{st.contacts.toLocaleString('es-MX')} contactos · {st.leads.toLocaleString('es-MX')} leads</span>
                  <span className={cx(s.wa, st.whatsapp_connected && s.waOn)}><i />{st.whatsapp_connected ? 'WhatsApp conectado' : 'Sin WhatsApp'}</span>
                </span>
                <span className={s.cellAct}>
                  <strong>{ago(st.last_activity_at)}</strong>
                  <small>Alta {fmt(st.created_at)}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {open && <StoreDrawer store={open} onClose={closeDrawer} onSaved={load} />}
    </div>
  )
}

/* ── Detalle y acciones de una tienda ───────────────────────────────────── */
function StoreDrawer({ store, onClose, onSaved }: { store: StoreRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [months, setMonths] = useState(1)
  const [days, setDays]     = useState(7)
  const [plan, setPlan]     = useState(store.plan)
  const [notes, setNotes]   = useState(store.platform_notes ?? '')
  const [busy, setBusy]     = useState('')
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'suspend' | 'cancel' | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const patch = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fetch(`/api/platform/stores/${store.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar')
      await onSaved()
      setMsg({ ok: true, text: done })
      setConfirm(null)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy('')
    }
  }

  const readonly = storeAccess(store) === 'readonly'

  return (
    <div className="modal" onClick={onClose}>
      <div className={cx('modal-card', s.drawer)} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pl-title">
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h3 id="pl-title">{store.name}</h3>
            <div className={s.drawerSub}>{store.slug} · {[store.city, store.state].filter(Boolean).join(', ') || 'Sin ubicación'}</div>
          </div>
          <button className="btn-icon modal-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="18" height="18"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className={s.facts}>
            <div><small>Estado</small><strong><em className={cx(s.badge, STATUS_CLS[store.status])}>{STATUS_LABELS[store.status]}</em>{readonly && <em className={cx(s.badge, s.bDanger)}>Solo lectura</em>}</strong></div>
            <div><small>Suscripción</small><strong>{subscriptionLine(store)}</strong></div>
            <div><small>Dueño</small><strong>{store.owner_name || '—'}</strong><span>{store.owner_email}</span></div>
            <div><small>Teléfono</small><strong>{store.phone || '—'}</strong></div>
            <div><small>Uso</small><strong>{store.members} usuarios · {store.contacts} contactos · {store.leads} leads</strong></div>
            <div><small>Alta</small><strong>{fmt(store.created_at)}</strong><span>{store.onboarding_completed_at ? 'Configuración terminada' : 'Aún configurando'}</span></div>
          </div>

          <div className={s.actions}>
            <div className={s.action}>
              <div><strong>Activar o renovar</strong><small>Suma a lo ya pagado si sigue vigente.</small></div>
              <div className={s.actionCtl}>
                <select className={s.select} value={months} onChange={e => setMonths(Number(e.target.value))} aria-label="Meses">
                  {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
                  <option value={0}>Sin vencimiento</option>
                </select>
                <button className="btn btn-primary" disabled={!!busy} onClick={() => patch('activate', { action: 'activate', months }, months ? `Activada por ${months} ${months === 1 ? 'mes' : 'meses'}` : 'Activada sin vencimiento')}>
                  {busy === 'activate' ? 'Guardando…' : 'Activar'}
                </button>
              </div>
            </div>
            <div className={s.action}>
              <div><strong>Extender prueba</strong><small>Vuelve a modo prueba con acceso completo.</small></div>
              <div className={s.actionCtl}>
                <select className={s.select} value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Días">
                  {[3, 7, 14, 30].map(d => <option key={d} value={d}>{d} días</option>)}
                </select>
                <button className="btn btn-ghost" disabled={!!busy} onClick={() => patch('trial', { action: 'extend_trial', days }, `Prueba extendida ${days} días`)}>
                  {busy === 'trial' ? 'Guardando…' : 'Extender'}
                </button>
              </div>
            </div>
            <div className={s.action}>
              <div><strong>Plan</strong><small>Define el límite de usuarios.</small></div>
              <div className={s.actionCtl}>
                <select className={s.select} value={plan} onChange={e => setPlan(e.target.value)} aria-label="Plan">
                  {Object.entries(PLANS).map(([id, p]) => <option key={id} value={id}>{p.label} · {p.maxUsers} usuarios</option>)}
                </select>
                <button className="btn btn-ghost" disabled={!!busy || plan === store.plan} onClick={() => patch('plan', { plan }, 'Plan actualizado')}>Guardar</button>
              </div>
            </div>
            <div className={cx(s.action, s.actionDanger)}>
              <div><strong>Suspender o cancelar</strong><small>La tienda queda en solo lectura; no se borra nada.</small></div>
              <div className={s.actionCtl}>
                {confirm ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => setConfirm(null)}>No</button>
                    <button className="btn btn-dark" disabled={!!busy} onClick={() => patch(confirm, { action: confirm }, confirm === 'suspend' ? 'Tienda suspendida' : 'Suscripción cancelada')}>
                      {busy ? 'Guardando…' : confirm === 'suspend' ? 'Sí, suspender' : 'Sí, cancelar'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost btn-ghost-danger" disabled={store.status === 'suspended'} onClick={() => setConfirm('suspend')}>Suspender</button>
                    <button className="btn btn-ghost btn-ghost-danger" disabled={store.status === 'cancelled'} onClick={() => setConfirm('cancel')}>Cancelar</button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
            <label htmlFor="pl-notes">Notas internas (pagos, acuerdos, contacto)</label>
            <textarea id="pl-notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Pagó 3 meses por transferencia el 2 de oct." />
          </div>
          {msg && <div className={cx(s.msg, msg.ok ? s.msgOk : s.msgErr)} role="status">{msg.text}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-dark" disabled={!!busy || notes === (store.platform_notes ?? '')} onClick={() => patch('notes', { notes: notes.trim() || null }, 'Notas guardadas')}>
            {busy === 'notes' ? 'Guardando…' : 'Guardar notas'}
          </button>
        </div>
      </div>
    </div>
  )
}
