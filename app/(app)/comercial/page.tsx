'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch, cachedQueryData } from '@/lib/apiClient'
import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, useDataChanged } from '@/lib/crmEvents'
import { bucketOf, inQueue, queueCompare, suggestNext, type CallResult, type CommercialContact } from '@/lib/commercial'
import { Select } from '@/components/Select'
import { CallPanel } from './CallPanel'
import { ResumenTab } from './ResumenTab'
import { HoyTab } from './HoyTab'
import { SeguimientoTab } from './SeguimientoTab'
import { ActividadesTab } from './ActividadesTab'
import { BaseTab } from './BaseTab'
import { AltaTab } from './AltaTab'
import { ControlTab } from './ControlTab'
import { Ico, bizName, type CommercialData } from './ui'

const PATH = '/api/data/commercial'
type Tab = 'resumen' | 'hoy' | 'seguimiento' | 'actividades' | 'base' | 'alta' | 'control'
const TAB_KEYS: Tab[] = ['resumen', 'hoy', 'seguimiento', 'actividades', 'base', 'alta', 'control']

export default function ComercialPage() {
  // ?id= abre un contacto directo (desde el buscador, Inicio o Contactos); ?tab= abre una pestaña
  return <Suspense fallback={null}><ComercialContent /></Suspense>
}

function ComercialContent() {
  const router = useRouter()
  const params = useSearchParams()
  const deepId = params.get('id')
  const session = useSession()
  const isAdmin = !!session?.isAdmin
  const readonly = session?.store?.access === 'readonly'
  const waModule = !!session?.store?.modules.whatsapp

  const [data, setData]       = useState<CommercialData | null>(() => cachedQueryData<CommercialData>(PATH) ?? null)
  const [loading, setLoading] = useState(() => !cachedQueryData(PATH))
  useDataReady(loading, 'comercial')
  const wanted = params.get('tab') as Tab | null
  const [tab, setTab]         = useState<Tab | null>(wanted && TAB_KEYS.includes(wanted) ? wanted : null)
  const [scope, setScope]     = useState('mine')   // dueño/admin: 'mine' | 'all' | user_id
  const [open, setOpen]       = useState<{ id: string; result?: CallResult } | null>(null)
  const [queueIds, setQueueIds] = useState<string[] | null>(null)
  const [toast, setToast]     = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2400)
  }, [])

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(PATH)
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }, [])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['contact', 'commercial'], load)

  const today = data?.today ?? ''
  const uid = data?.uid ?? ''
  const salesTeam = !!data?.salesTeam
  const team = useMemo(() => data?.team ?? [], [data])
  const contacts = useMemo(() => data?.contacts ?? [], [data])

  // Pestaña inicial: el dueño entra al resumen; el vendedor (y Litro) a su día
  const current: Tab = tab ?? (isAdmin && salesTeam ? 'resumen' : 'hoy')

  useEffect(() => { if (deepId && contacts.some(c => c.id === deepId)) setOpen({ id: deepId }) }, [deepId, contacts])

  // "Mis contactos" del dueño: los suyos; sin reparto (Litro) también los sin asignar
  const inScope = useCallback((c: CommercialContact) => {
    if (!isAdmin || scope === 'all') return true
    if (scope === 'mine') return c.owner_id === uid || (!salesTeam && c.owner_id === null)
    return c.owner_id === scope
  }, [isAdmin, scope, uid, salesTeam])
  const scoped = useMemo(() => contacts.filter(inScope), [contacts, inScope])
  const queue = useMemo(() => scoped.filter(c => inQueue(bucketOf(c, today))).sort(queueCompare(today)), [scoped, today])

  const canWork = useCallback((c: CommercialContact) => c.owner_id === uid || (c.owner_id === null && isAdmin), [uid, isAdmin])
  const ownerName = useCallback((id: string | null) => (id ? team.find(m => m.user_id === id)?.name : undefined), [team])

  const replaceContact = useCallback((c: CommercialContact) => {
    setData(d => d ? { ...d, contacts: d.contacts.map(x => x.id === c.id ? { ...x, ...c, owner_name: ownerName(c.owner_id) ?? x.owner_name } : x) } : d)
    notifyDataChanged('commercial')
  }, [ownerName])
  const addContact = useCallback((c: CommercialContact) => {
    setData(d => d ? { ...d, contacts: [...d.contacts, { ...c, owner_name: ownerName(c.owner_id) }] } : d)
  }, [ownerName])

  const openContact = (c: CommercialContact, opts: { result?: CallResult; fromQueue?: boolean } = {}) => {
    setOpen({ id: c.id, result: opts.result })
    setQueueIds(opts.fromQueue ? queue.map(x => x.id) : null)
  }
  const closeContact = () => {
    setOpen(null)
    setQueueIds(null)
    if (deepId) router.replace('/comercial', { scroll: false })
  }

  // "No contesta" desde la tarjeta: se registra sin abrir la ficha, con la fecha sugerida
  const quickNoAnswer = async (c: CommercialContact) => {
    const next = suggestNext('no_contesta', today)
    const r = await apiFetch('/api/data/commercial/activities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: c.id, kind: 'llamada', result: 'no_contesta', next_action: next.nextAction, next_action_at: next.nextAt }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { showToast(d.error || 'No se pudo registrar'); return }
    if (d.contact) replaceContact(d.contact)
    showToast(`${bizName(c)}: no contesta, se vuelve a llamar mañana`)
  }

  const openRow = open ? contacts.find(c => c.id === open.id) ?? null : null
  const nextInQueue = useMemo(() => {
    if (!queueIds || !open) return null
    const at = queueIds.indexOf(open.id)
    for (const id of queueIds.slice(at + 1)) {
      const c = contacts.find(x => x.id === id)
      if (c && inQueue(bucketOf(c, today)) && canWork(c)) return c
    }
    return null
  }, [queueIds, open, contacts, today, canWork])

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'hoy', label: 'Hoy', count: queue.length },
    { key: 'seguimiento', label: 'Seguimiento' },
    { key: 'actividades', label: 'Actividades' },
    { key: 'base', label: 'Base comercial' },
    ...(readonly ? [] : [{ key: 'alta' as Tab, label: 'Alta de prospectos' }]),
    { key: 'control', label: 'Control diario' },
  ]
  const scoping = isAdmin && team.length > 1 && (current === 'hoy' || current === 'seguimiento' || current === 'base')

  return (
    <>
      <div className="section-head">
        <h2>Sistema comercial</h2>
        {!loading && <span className="count">{queue.length} para llamar hoy</span>}
        {scoping && (
          <div className="section-actions">
            <Select value={scope} onChange={setScope} aria-label="De quién" style={{ minWidth: 190 }}
              options={[
                { value: 'mine', label: salesTeam ? 'Mis contactos' : 'Mis contactos y sin asignar' },
                { value: 'all', label: 'Todo el equipo' },
                ...team.filter(m => m.user_id !== uid).map(m => ({ value: m.user_id, label: m.name })),
              ]} />
          </div>
        )}
      </div>

      <div className="status-tabs" role="tablist" aria-label="Sistema comercial">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={current === t.key} className={`status-tab ${current === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{!loading && t.count !== undefined && <span className="status-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : current === 'resumen' ? (
        <ResumenTab contacts={isAdmin ? contacts : scoped} today={today} salesTeam={salesTeam} isAdmin={isAdmin}
          onOpen={c => openContact(c)} onGoTo={setTab} />
      ) : current === 'hoy' ? (
        <HoyTab queue={queue} today={today} uid={uid} isAdmin={isAdmin} salesTeam={salesTeam} readonly={readonly}
          unassigned={isAdmin && salesTeam && scope === 'mine' ? contacts.filter(c => c.owner_id === null).length : 0}
          canWork={canWork} onOpen={(c, result) => openContact(c, { result, fromQueue: true })} onNoAnswer={quickNoAnswer}
          onGoTo={setTab} />
      ) : current === 'seguimiento' ? (
        <SeguimientoTab contacts={scoped} today={today} multiOwner={isAdmin && scope !== 'mine'} onOpen={c => openContact(c)} />
      ) : current === 'actividades' ? (
        <ActividadesTab today={today} isAdmin={isAdmin} team={team} onOpen={id => { const c = contacts.find(x => x.id === id); if (c) openContact(c) }} />
      ) : current === 'base' ? (
        <BaseTab contacts={contacts} inScope={inScope} today={today} isAdmin={isAdmin} salesTeam={salesTeam} readonly={readonly}
          uid={uid} team={team} onOpen={c => openContact(c)}
          onAssigned={(n, msg) => { showToast(msg); if (n) { load(); notifyDataChanged('commercial') } }} />
      ) : current === 'alta' ? (
        <AltaTab contacts={contacts} isAdmin={isAdmin} salesTeam={salesTeam} uid={uid} team={team}
          onCreated={(c, callNow) => { addContact(c); notifyDataChanged('contact'); showToast('Prospecto guardado'); if (callNow) openContact(c) }} />
      ) : (
        <ControlTab today={today} isAdmin={isAdmin} readonly={readonly} team={team} salesTeam={salesTeam} uid={uid} />
      )}

      {openRow && (
        <CallPanel key={`${openRow.id}-${open?.result ?? ''}`} contact={openRow} today={today} canWork={canWork(openRow)} readonly={readonly} waModule={waModule}
          initialResult={open?.result}
          onClose={closeContact}
          onChanged={c => { replaceContact(c); showToast('Guardado') }}
          onNext={nextInQueue ? () => setOpen({ id: nextInQueue.id }) : undefined}
          nextName={nextInQueue ? bizName(nextInQueue) : undefined} />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}
