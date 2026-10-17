'use client'

import { apiFetch } from '@/lib/apiClient'


import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { fmtMoney, isMoney } from '@/lib/payments'
import { PLANS, STATUS_LABELS, planOf, storeAccess, type StoreStatus } from '@/lib/stores'
import {
  ago, countStores, expiresSoon, fmtDate as fmt, isLapsed, isOff, isPending, subscriptionLine, usePayments, usePlatformStores, wantsWhatsApp, type PlatformStore,
} from '../data'
import { PaymentForm, PaymentRow } from '../payments-ui'
import { NewStoreModal, OwnerInviteBlock } from '../stores-ui'
import { WhatsAppConnectionBlock } from '../whatsapp-ui'
import s from '../admin.module.css'

/**
 * Panel del dueño › Tiendas: alta de tiendas por invitación ("Nueva tienda"),
 * todas las tiendas con su suscripción y, en la ficha de cada una, invitación
 * del dueño, registrar pagos, precio acordado y acciones manuales (plan, sin
 * vencimiento, suspender).
 * /admin/tiendas?tienda=<id> abre directo la ficha (enlaces del Resumen y Pagos).
 */

type StoreRow = PlatformStore
type Filter = 'all' | 'pending' | 'trial' | 'active' | 'expiring' | 'readonly' | 'off'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

const STATUS_CLS: Record<StoreStatus, string> = { pending: s.bPending, trial: s.bTrial, active: s.bActive, suspended: s.bDanger, cancelled: s.bMuted }

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
  const [creating, setCreating] = useState(false)

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
        case 'pending': return isPending(st)
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
  // Ya no hay pruebas gratis: "En prueba" solo aparece si queda alguna tienda así
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' }, { id: 'pending', label: 'Por activar' }, { id: 'active', label: 'Activas' },
    ...(counts.trial ? [{ id: 'trial' as Filter, label: 'En prueba' }] : []),
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
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" width="15" height="15" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Nueva tienda
        </button>
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
            return (
              <button key={st.id} className={s.tr} onClick={() => setOpenId(st.id)}>
                <span className={s.cellStore}>
                  <strong>{st.name}</strong>
                  <small>{[st.city, st.state].filter(Boolean).join(', ') || st.slug}{!st.onboarding_completed_at && ' · configurando'}</small>
                </span>
                <span className={s.cellOwner}>
                  {st.owner_email ? (
                    <><strong>{st.owner_name || '—'}</strong><small>{st.owner_email}</small></>
                  ) : st.owner_invite ? (
                    <><strong>{st.owner_invite.status === 'expired' ? 'Invitación vencida' : 'Invitación enviada'}</strong><small>{st.owner_invite.email}</small></>
                  ) : (
                    <><strong>—</strong><small>Sin dueño</small></>
                  )}
                </span>
                <span className={s.cellSub}>
                  <span className={s.badges}>
                    <em className={cx(s.badge, STATUS_CLS[st.status])}>{STATUS_LABELS[st.status]}</em>
                    {isLapsed(st) && <em className={cx(s.badge, s.bDanger)}>Solo lectura</em>}
                    {expiresSoon(st) && <em className={cx(s.badge, s.bWarn)}>Por vencer</em>}
                    {wantsWhatsApp(st) && <em className={cx(s.badge, s.bActive)}>Pidió WhatsApp</em>}
                  </span>
                  <small>{subscriptionLine(st)}</small>
                </span>
                <span className={s.cellUse}>
                  <span title="Usuarios activos">{st.members}/{planOf(st.plan).maxUsers} usuarios</span>
                  <span title="Contactos y leads">{st.contacts.toLocaleString('es-MX')} contactos · {st.leads.toLocaleString('es-MX')} leads</span>
                  {st.whatsapp_connected && <span className={cx(s.wa, s.waOn)}><i />WhatsApp conectado</span>}
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
      {creating && (
        <NewStoreModal onClose={() => setCreating(false)} onCreated={load}
          onOpenStore={id => { setCreating(false); setOpenId(id) }} />
      )}
    </div>
  )
}

/* ── Detalle y acciones de una tienda ───────────────────────────────────── */
function StoreDrawer({ store, onClose, onSaved }: { store: StoreRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const { payments, error: payError, reload: reloadPayments } = usePayments({ store: store.id })
  const [plan, setPlan]     = useState(store.plan)
  const [price, setPrice]   = useState(store.monthly_price === null ? '' : String(store.monthly_price))
  const [notes, setNotes]   = useState(store.platform_notes ?? '')
  const [busy, setBusy]     = useState('')
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'suspend' | 'cancel' | 'unlimited' | 'wa_off' | null>(null)
  const waActive = !!store.modules?.whatsapp

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Después de un pago o una anulación: recargar la tienda (vigencia) y sus pagos
  const done = async (text: string) => {
    await Promise.all([onSaved(), reloadPayments()])
    setMsg({ ok: true, text })
  }

  const patch = async (key: string, body: Record<string, unknown>, text: string) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await apiFetch(`/api/platform/stores/${store.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar')
      await onSaved()
      setMsg({ ok: true, text })
      setConfirm(null)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy('')
    }
  }

  const priceValue = price.trim() === '' ? null : Number(price)
  const priceValid = priceValue === null || isMoney(priceValue)
  // Solo el pago vigente más reciente se puede anular (la base lo vuelve a validar)
  const latestLive = payments?.find(p => !p.voided_at)?.id

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
            <div><small>Estado</small><strong><em className={cx(s.badge, STATUS_CLS[store.status])}>{STATUS_LABELS[store.status]}</em>{isLapsed(store) && <em className={cx(s.badge, s.bDanger)}>Solo lectura</em>}</strong></div>
            <div><small>Suscripción</small><strong>{subscriptionLine(store)}</strong></div>
            <div><small>Dueño</small><strong>{store.owner_name || (store.owner_email ? '—' : 'Aún no entra')}</strong><span>{store.owner_email ?? store.owner_invite?.email}</span></div>
            <div><small>Precio acordado</small><strong>{store.monthly_price === null ? 'Sin acordar' : `${fmtMoney(store.monthly_price)} al mes`}</strong></div>
            <div><small>Uso</small><strong>{store.members} usuarios · {store.contacts} contactos · {store.leads} leads</strong></div>
            <div><small>Alta</small><strong>{fmt(store.created_at)}</strong><span>{store.onboarding_completed_at ? 'Configuración terminada' : 'Aún configurando'}</span></div>
          </div>

          {msg && <div className={cx(s.msg, msg.ok ? s.msgOk : s.msgErr)} role="status" style={{ marginTop: 0, marginBottom: 14 }}>{msg.text}</div>}

          {!store.owner_email && <OwnerInviteBlock key={store.id} store={store} onDone={onSaved} />}

          <PaymentForm key={`${store.id}-${store.monthly_price}`} store={store} onDone={done} />

          <div className={s.block}>
            <div className={s.blockHead}>
              <strong>Pagos de esta tienda</strong>
              <Link href="/admin/pagos" className={s.panelLink}>Ver todos los pagos</Link>
            </div>
            {payError && <div className={s.error}>{payError}</div>}
            {!payments && !payError && <div className={s.center} style={{ padding: 16 }}><span className={s.spinner} /></div>}
            {payments?.length === 0 && <div className={s.panelEmpty} style={{ padding: '4px 0 2px' }}>Todavía no hay pagos registrados.</div>}
            {payments?.map(p => <PaymentRow key={p.id} payment={p} canVoid={p.id === latestLive} onVoided={done} />)}
          </div>

          {/* Conexión técnica del número: solo cuando la tienda tiene o pidió WhatsApp */}
          {(waActive || !!store.whatsapp_requested_at) && <WhatsAppConnectionBlock key={store.id} storeId={store.id} onChanged={onSaved} />}

          <div className={s.actions}>
            <div className={s.action}>
              <div><strong>Precio acordado</strong><small>Mensual, en MXN. Prellena el monto al registrar un pago.</small></div>
              <div className={s.actionCtl}>
                <input className={s.input} inputMode="decimal" value={price} placeholder="Sin acordar" aria-label="Precio mensual acordado"
                  onChange={e => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
                <button className="btn btn-ghost" disabled={!!busy || !priceValid || priceValue === store.monthly_price}
                  onClick={() => patch('price', { monthlyPrice: priceValue }, priceValue === null ? 'Precio acordado borrado' : `Precio acordado: ${fmtMoney(priceValue)} al mes`)}>
                  {busy === 'price' ? 'Guardando…' : 'Guardar'}
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
            <div className={s.action}>
              <div>
                <strong>WhatsApp y Campañas</strong>
                <small>
                  {waActive
                    ? `Activo${store.whatsapp_connected ? ' · número conectado' : ' · falta conectar el número (sección Conexión de WhatsApp)'}.`
                    : store.whatsapp_requested_at
                      ? `Lo solicitó el ${fmt(store.whatsapp_requested_at)}: contacta a la tienda para ofrecérselo.`
                      : 'No lo ha solicitado. La tienda lo ve como "Por activar".'}
                </small>
              </div>
              <div className={s.actionCtl}>
                {!waActive ? (
                  <button className="btn btn-ghost" disabled={!!busy} onClick={() => patch('wa', { whatsapp: true }, 'WhatsApp y Campañas activados')}>
                    {busy === 'wa' ? 'Guardando…' : 'Activar'}
                  </button>
                ) : confirm === 'wa_off' ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => setConfirm(null)}>No</button>
                    <button className="btn btn-dark" disabled={!!busy} onClick={() => patch('wa', { whatsapp: false }, 'WhatsApp y Campañas desactivados')}>
                      {busy === 'wa' ? 'Guardando…' : 'Sí, desactivar'}
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-ghost-danger" onClick={() => setConfirm('wa_off')}>Desactivar</button>
                )}
              </div>
            </div>
            <div className={s.action}>
              <div><strong>Sin vencimiento</strong><small>Para tu propia tienda o un acuerdo especial: activa sin fecha de pago.</small></div>
              <div className={s.actionCtl}>
                {confirm === 'unlimited' ? (
                  <>
                    <button className="btn btn-ghost" onClick={() => setConfirm(null)}>No</button>
                    <button className="btn btn-dark" disabled={!!busy} onClick={() => patch('unlimited', { action: 'activate' }, 'Activada sin vencimiento')}>
                      {busy === 'unlimited' ? 'Guardando…' : 'Sí, sin vencimiento'}
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost" disabled={!!busy || (store.status === 'active' && !store.paid_until)} onClick={() => setConfirm('unlimited')}>Activar</button>
                )}
              </div>
            </div>
            <div className={cx(s.action, s.actionDanger)}>
              <div><strong>Suspender o cancelar</strong><small>La tienda queda en solo lectura; no se borra nada.</small></div>
              <div className={s.actionCtl}>
                {confirm === 'suspend' || confirm === 'cancel' ? (
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
            <label htmlFor="pl-notes">Notas internas (acuerdos, contacto)</label>
            <textarea id="pl-notes" rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. Lo atiende Juan; prefiere que le llamen en la tarde." />
          </div>
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
