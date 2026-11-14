'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch, cachedQueryData } from '@/lib/apiClient'
import { useDataReady, useQueryEffect } from '@/lib/useCachedQuery'
import { useSession } from '@/lib/profile'
import { notifyDataChanged, useDataChanged } from '@/lib/crmEvents'
import type { CommercialContact } from '@/lib/commercial'
import { HoyView, type Opened, type Sub } from './HoyView'
import { CarteraView } from './CarteraView'
import { OportunidadesView } from './OportunidadesView'
import { ActividadView } from './ActividadView'
import { AcumuladoView } from './AcumuladoView'
import { ContactPanel } from './ContactPanel'
import { GuideButton, useGuide } from '@/components/GuideModal'
import { CommercialTour } from './CommercialTour'
import { commercialTour, type CommercialStep } from './tourSteps'
import { Ico, bizName, useWide, whenPhrase, type TodayData } from './ui'
import s from './comercial.module.css'

const PATH = '/api/data/commercial'
/** Prospectos nuevos por página y lo más que se pide de una vez (igual que el servidor). */
const FRESH_PAGE = 30
const MAX_FRESH = 300
type Tab = 'hoy' | 'cartera' | 'oportunidades' | 'actividad' | 'acumulado'
const TAB_KEYS: Tab[] = ['hoy', 'cartera', 'oportunidades', 'actividad', 'acumulado']

export default function ComercialPage() {
  // ?id= abre un contacto (desde el buscador, Inicio, Contactos o WhatsApp); ?tab= abre una pestaña
  return <Suspense fallback={null}><ComercialContent /></Suspense>
}

function ComercialContent() {
  const router = useRouter()
  const params = useSearchParams()
  const deepId = params.get('id')
  const session = useSession()
  const readonly = session?.store?.access === 'readonly'
  const waModule = !!session?.store?.modules.whatsapp
  const wide = useWide()

  const [data, setData] = useState<TodayData | null>(() => cachedQueryData<TodayData>(PATH) ?? null)
  const [loading, setLoading] = useState(() => !cachedQueryData(PATH))
  useDataReady(loading, 'comercial')
  // ?tab=equipo es el nombre anterior de Actividad diaria (enlaces viejos)
  const wanted = (params.get('tab') === 'equipo' ? 'actividad' : params.get('tab')) as Tab | null
  const [tab, setTab] = useState<Tab>(wanted && TAB_KEYS.includes(wanted) ? wanted : 'hoy')
  const [sub, setSub] = useState<Sub>('pend')
  const [zone, setZone] = useState('')
  const [segment, setSegment] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [overlay, setOverlay] = useState<Opened | null>(deepId ? { id: deepId } : null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3600)
  }, [])

  // La búsqueda espera a que dejes de escribir
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // limit / vlimit: cuántos nuevos y "para visita" traer desde el principio (el servidor topa en 300)
  const url = useCallback((limit = 0, vlimit = 0) => {
    const qs = new URLSearchParams()
    if (zone) qs.set('zone', zone)
    if (segment) qs.set('segment', segment)
    if (search) qs.set('q', search)
    if (limit > FRESH_PAGE) qs.set('limit', String(Math.min(limit, MAX_FRESH)))
    if (vlimit > FRESH_PAGE) qs.set('vlimit', String(Math.min(vlimit, MAX_FRESH)))
    const str = qs.toString()
    return str ? `${PATH}?${str}` : PATH
  }, [zone, segment, search])

  // Cuántos se ven: al refrescar (por un guardado) se conservan los ya cargados
  const shown = useRef({ fresh: 0, visit: 0 })
  shown.current = { fresh: data?.fresh.length ?? 0, visit: data?.visit?.length ?? 0 }
  const load = useCallback(async (keep = false) => {
    try {
      const r = await apiFetch(keep ? url(shown.current.fresh, shown.current.visit) : url())
      if (r.ok) setData(await r.json())
    } catch {} finally { setLoading(false) }
  }, [url])
  useQueryEffect(() => { load() }, [load])
  useDataChanged(['contact', 'commercial'], () => load(true))
  useEffect(() => { if (deepId) setOverlay({ id: deepId }) }, [deepId])

  async function loadMore(which: 'fresh' | 'visit') {
    if (!data) return
    setLoadingMore(true)
    try {
      // Se vuelve a pedir desde el principio: si alguien ya tomó prospectos de la lista, no se salta ninguno
      const r = await apiFetch(which === 'fresh'
        ? url(data.fresh.length + FRESH_PAGE, data.visit.length)
        : url(data.fresh.length, data.visit.length + FRESH_PAGE))
      if (r.ok) {
        const more: TodayData = await r.json()
        setData(d => d ? (which === 'fresh'
          ? { ...d, fresh: more.fresh, freshTotal: more.freshTotal }
          : { ...d, visit: more.visit, visitTotal: more.visitTotal }) : d)
      }
    } finally { setLoadingMore(false) }
  }

  const today = data?.today
  // Al guardar: sale de la lista si ya no toca hoy; luego se recargan avance y lista
  const onSaved = useCallback((c: CommercialContact) => {
    setData(d => {
      if (!d) return d
      // Sigue en Nuevos / Para visita mientras nadie lo trabaje y sea tuyo o sin asignar
      const untouched = (x: CommercialContact) => !x.last_activity_at && (!x.owner_id || x.owner_id === d.uid)
      const stays = (x: CommercialContact) => x.next_action_at !== null && x.next_action_at <= d.today && x.commercial_status !== 'depurar'
      return {
        ...d,
        due: stays(c) ? d.due.map(x => x.id === c.id ? { ...x, ...c } : x) : d.due.filter(x => x.id !== c.id),
        dueTotal: !stays(c) && d.due.some(x => x.id === c.id) ? Math.max(0, d.dueTotal - 1) : d.dueTotal,
        fresh: d.fresh.filter(x => x.id !== c.id || (untouched(c) && !c.next_action_at)),
        visit: d.visit.filter(x => x.id !== c.id || untouched(c)),
        found: d.found && d.found.map(x => x.id === c.id ? { ...x, ...c } : x),
      }
    })
    // Dice a dónde se fue: vuelve en su fecha a Pendientes y a la Agenda
    showToast(c.next_action_at && today && c.commercial_status !== 'depurar'
      ? `${bizName(c)}: guardado · vuelve ${whenPhrase(c.next_action_at, today)}, también en tu Agenda`
      : `${bizName(c)}: guardado`)
    notifyDataChanged('commercial')
  }, [showToast, today])

  const closeOverlay = () => {
    setOverlay(null)
    if (deepId) router.replace('/comercial', { scroll: false })
  }

  const salesTeam = !!data?.salesTeam
  const reports = !!data?.reports
  const isAdmin = !!data?.isAdmin
  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'hoy', label: 'Hoy', count: data?.dueTotal },
    { key: 'cartera', label: 'Cartera' },
    ...(salesTeam ? [{ key: 'oportunidades' as Tab, label: 'Oportunidades' }] : []),
    ...(salesTeam && isAdmin ? [{ key: 'actividad' as Tab, label: 'Actividad diaria' }] : []),
    ...(reports && isAdmin ? [{ key: 'acumulado' as Tab, label: 'Acumulado' }] : []),
  ]
  const current: Tab = TABS.some(t => t.key === tab) ? tab : 'hoy'
  // Recorrido: solo la primera vez (no si se llegó directo a una ficha). Clave
  // nueva para que también lo vea una vez quien ya vio la guía anterior.
  const guide = useGuide('comercial-recorrido', !loading && !!data && !deepId)

  // Cliente de ejemplo: el primero de Pendientes, si no de Nuevos, si no de Para visita
  const tourClient: { id: string; sub: Sub } | null = !data ? null
    : data.due[0] ? { id: data.due[0].id, sub: 'pend' }
    : data.fresh[0] ? { id: data.fresh[0].id, sub: 'nuevos' }
    : data.visit[0] ? { id: data.visit[0].id, sub: 'visita' }
    : null
  // Al terminar se deja la pantalla como estaba
  const beforeTour = useRef<{ tab: Tab; sub: Sub; opened: Opened | null } | null>(null)
  const startTour = useCallback(() => {
    beforeTour.current = { tab, sub, opened }
    guide.show()
  }, [tab, sub, opened, guide])
  const endTour = useCallback(() => {
    const b = beforeTour.current
    if (b) { setTab(b.tab); setSub(b.sub); setOpened(b.opened) }
    beforeTour.current = null
    guide.close()
  }, [guide])
  // Cada paso deja lista la pantalla: en Hoy y, si toca, con el cliente de ejemplo visible o abierto
  const prepareStep = useCallback((step: CommercialStep) => {
    setTab('hoy')
    if (step.prepare && tourClient) {
      setSub(tourClient.sub)
      setOpened(step.prepare === 'ficha' || wide ? { id: tourClient.id } : null)
    } else if (!wide) {
      setOpened(null)
    }
  }, [tourClient, wide])
  // La primera vez sale sola: también hay que recordar cómo estaba la pantalla
  useEffect(() => {
    if (guide.open && !beforeTour.current) beforeTour.current = { tab, sub, opened }
  }, [guide.open, tab, sub, opened])

  return (
    <>
      <div className={s.tabsRow}>
        {TABS.length > 1 && (
          <div className={s.tabs} role="tablist" aria-label="Sistema Comercial" data-tour="tabs">
            {TABS.map(t => (
              <button key={t.key} role="tab" aria-selected={current === t.key} className={`${s.tab} ${s.press}`} onClick={() => setTab(t.key)} data-tour={`tab-${t.key}`}>
                {t.label}{t.count ? <span className={`${s.tabCount} ${s.num}`}>{t.count}</span> : null}
              </button>
            ))}
          </div>
        )}
        <GuideButton onClick={startTour} />
      </div>
      {guide.open && data && (
        <CommercialTour
          steps={commercialTour({ isAdmin, salesTeam, reports, readonly, waModule, clientId: tourClient?.id })}
          onStep={step => prepareStep(step as CommercialStep)}
          onClose={endTour} />
      )}

      {loading || !data ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : current === 'hoy' ? (
        <HoyView data={data} wide={wide} sub={sub} zone={zone} segment={segment} query={query} readonly={readonly} waModule={waModule} storeName={session?.store?.name} loadingMore={loadingMore}
          onSub={setSub} onZone={setZone} onSegment={setSegment} onQuery={setQuery} onClear={() => { setZone(''); setSegment(''); setQuery('') }}
          onMore={loadMore} onSaved={onSaved} opened={opened} onOpen={setOpened} />
      ) : current === 'cartera' ? (
        <CarteraView uid={data.uid} isAdmin={isAdmin && salesTeam} zones={data.zones} segments={data.segments ?? []}
          zone={zone} segment={segment} onZone={setZone} onSegment={setSegment} onOpen={setOverlay} />
      ) : current === 'oportunidades' ? (
        <OportunidadesView isAdmin={isAdmin} segments={data.segments ?? []} onOpen={setOverlay} />
      ) : current === 'acumulado' ? (
        <AcumuladoView onOpen={id => setOverlay({ id })} />
      ) : (
        <ActividadView reports={reports} />
      )}

      {overlay && data && (
        <ContactPanel key={`${overlay.id}-${overlay.result ?? ''}`} contactId={overlay.id} today={data.today} variant="overlay"
          readonly={readonly} waModule={waModule} storeName={session?.store?.name} uid={data.uid} kind={overlay.kind} result={overlay.result}
          onSaved={c => { onSaved(c); closeOverlay() }} onClose={closeOverlay} />
      )}

      {toast && <div className="toast-fixed"><Ico.check /> {toast}</div>}
    </>
  )
}
