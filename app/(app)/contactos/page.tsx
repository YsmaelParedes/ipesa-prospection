'use client'

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Avatar, TipoChip, CanalChip, FilterDropdown, EstadoChip, fmtDateLong, fmtPhone, normalizePhone, isMobilePhone } from '@/components/CrmUI'
import { phoneDigits } from '@/components/ContactFormModal'
import { useSession } from '@/lib/profile'
import { useCatalogs } from '@/lib/catalogs'
import { isOpenLead, reminderTitle, type Reminder } from '@/lib/crm'
import { notifyDataChanged, openQuickCreate, useDataChanged } from '@/lib/crmEvents'
import { fmtDue, isOverdue } from '@/lib/datetime'
import { normText } from '@/lib/searchIndex'
import { WhatsAppTemplatePicker, type WhatsAppTemplateSelection } from '@/components/WhatsAppTemplatePicker'
import { useWhatsAppCampaignQuota, CampaignQuotaNote } from '@/components/WhatsAppCampaignQuota'
import { useCampaignSend, CampaignConfirmPanel, CampaignProgressPanel, CampaignResultsPanel } from '@/components/WhatsAppCampaignSend'
import { StatusTicks, WindowBadge, fmtTime, mediaCaption } from '@/components/WhatsAppUI'

/* ── Iconos ── */
const Ico = {
  close:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  phone:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.961.361 1.904.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.906.339 1.849.573 2.81.7a2 2 0 0 1 1.72 2.03Z"/></svg>,
  mail:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  upload:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>,
  download:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>,
  chevron: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--muted-2)' }}><path d="m9 18 6-6-6-6"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--warning-fill)' }}><path d="m5 13 4 4L19 7"/></svg>,
  edit:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  xmark:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  search:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, color: 'var(--muted)' }}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  whatsapp: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1s-.8.9-1 1.1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.4-1.4-.9-.8-1.5-1.8-1.7-2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.7-1.7-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.4 1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4 0-.1-.3-.2-.6-.4Zm-5.5 7.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.4-9.9 9.9-9.9s9.9 4.4 9.9 9.9-4.5 9.9-10 9.9Zm8.4-18.3C18.2 1.5 15.2.3 12 .3 5.4.3.1 5.6.1 12.2c0 2.1.6 4.2 1.6 6L0 24l5.9-1.5c1.7 1 3.7 1.5 5.7 1.5 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.4Z"/></svg>,
  send:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>,
}

const CAMPOS_DESTINO = ['name', 'phone', 'email', 'company', 'address', 'postal_code', 'segment', 'acquisition_channel']
const CAMPO_LABELS: Record<string, string> = {
  name: 'Nombre', phone: 'Teléfono', email: 'Correo', company: 'Empresa',
  address: 'Dirección', postal_code: 'C.P.', segment: 'Segmento', acquisition_channel: 'Canal',
}
const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || name

export default function ContactosPage() {
  // useSearchParams (?id= ficha directa, ?q= búsqueda) requiere Suspense
  return <Suspense fallback={null}><ContactosContent /></Suspense>
}

function ContactosContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const deepId       = searchParams.get('id')
  const urlQuery     = searchParams.get('q')
  const session      = useSession()
  const isAdmin      = !!session?.isAdmin
  const readonly     = session?.store?.access === 'readonly'
  const waModule     = !session?.store || session.store.modules.whatsapp
  const canCampaign  = isAdmin && waModule && (!session?.store || session.store.modules.campaigns)

  const [contacts, setContacts]       = useState<any[]>([])
  const [segF, setSegF]               = useState('Todos')
  const [canalF, setCanalF]           = useState('Todos')
  const [search, setSearch]           = useState(urlQuery ?? '')
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<any | null>(null)
  const [showImport, setShowImport]   = useState(false)
  const [showExport, setShowExport]   = useState(false)
  const [onlyLandlines, setOnlyLandlines] = useState(false)
  const [toast, setToast]             = useState('')
  const [showWhatsAppCampaign, setShowWhatsAppCampaign] = useState(false)

  /* Selección múltiple */
  const [checkedIds, setCheckedIds]         = useState<Set<string>>(new Set())
  const [confirmBulkDel, setConfirmBulkDel] = useState(false)
  const [bulkDeleting, setBulkDeleting]     = useState(false)
  const lastCheckedIdx                      = useRef<number | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/data/contacts')
      const d = await r.json()
      const list: any[] = d.contacts || []
      setContacts(list)
      setSelected((prev: any) => prev ? (list.find(c => c.id === prev.id) ?? prev) : prev)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useDataChanged(['contact'], load)

  /* ?q= desde el buscador global */
  useEffect(() => { if (urlQuery !== null) setSearch(urlQuery) }, [urlQuery])

  /* Abrir la ficha indicada en la URL (?id=…), p. ej. desde el buscador o la bandeja de WhatsApp */
  useEffect(() => {
    if (!deepId || loading) return
    const found = contacts.find(c => c.id === deepId)
    if (found) { setSelected(found); return }
    fetch(`/api/data/contacts/${deepId}`).then(r => (r.ok ? r.json() : null)).then(c => { if (c?.id) setSelected(c) }).catch(() => {})
  }, [deepId, loading, contacts])

  const closeDetail = () => {
    setSelected(null)
    if (deepId) router.replace('/contactos', { scroll: false })
  }

  // Cálculos derivados memoizados: con cientos de contactos, recalcularlos en
  // cada tecla/clic hacía lenta la lista.
  const landlineIds = useMemo(() => new Set(contacts.filter(c => !isMobilePhone(c.phone)).map(c => c.id)), [contacts])
  const segmentCounts = useMemo(() => countBy(contacts, 'segment'), [contacts])
  const canalCounts   = useMemo(() => countBy(contacts, 'acquisition_channel'), [contacts])
  const segmentOptions = useMemo(() => [...segmentCounts.keys()].sort(), [segmentCounts])
  const canalOptions   = useMemo(() => [...canalCounts.keys()].sort(), [canalCounts])

  const filtered = useMemo(() => {
    const q = normText(search)
    const words = q ? q.split(/\s+/) : []
    const digits = search.replace(/\D/g, '')
    return contacts.filter(c => {
      if (onlyLandlines && !landlineIds.has(c.id)) return false
      if (segF !== 'Todos' && c.segment !== segF) return false
      if (canalF !== 'Todos' && c.acquisition_channel !== canalF) return false
      if (words.length) {
        const hay = normText(`${c.name} ${c.email || ''} ${c.company || ''} ${c.acquisition_channel || ''} ${c.segment || ''}`)
        const byText = words.every(w => hay.includes(w))
        const byPhone = digits.length >= 3 && normalizePhone(c.phone).includes(digits)
        if (!byText && !byPhone) return false
      }
      return true
    })
  }, [contacts, search, segF, canalF, onlyLandlines, landlineIds])

  const filtersOn = segF !== 'Todos' || canalF !== 'Todos' || onlyLandlines || !!search.trim()
  const clearFilters = () => { setSegF('Todos'); setCanalF('Todos'); setOnlyLandlines(false); setSearch('') }

  /* ── Selección múltiple ── */
  const someChecked        = checkedIds.size > 0
  const allFilteredChecked = filtered.length > 0 && filtered.every(c => checkedIds.has(c.id))

  const clearSelection = () => {
    setCheckedIds(new Set())
    lastCheckedIdx.current = null
    setConfirmBulkDel(false)
  }

  const toggleAll = () => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (allFilteredChecked) filtered.forEach(c => next.delete(c.id))
      else                     filtered.forEach(c => next.add(c.id))
      return next
    })
    lastCheckedIdx.current = null
  }

  const toggleCheck = (id: string, idx: number, shiftKey: boolean) => {
    if (shiftKey && lastCheckedIdx.current !== null) {
      const from = Math.min(lastCheckedIdx.current, idx)
      const to   = Math.max(lastCheckedIdx.current, idx)
      setCheckedIds(prev => {
        const next = new Set(prev)
        filtered.slice(from, to + 1).forEach(c => next.add(c.id))
        return next
      })
    } else {
      setCheckedIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else              next.add(id)
        return next
      })
      lastCheckedIdx.current = idx
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    const ids = [...checkedIds]
    const deleted = new Set<string>()
    // Un request por cada 500
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const r = await fetch('/api/data/contacts', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: chunk }),
      }).catch(() => null)
      if (r?.ok) chunk.forEach(id => deleted.add(id))
    }
    setContacts(prev => prev.filter(c => !deleted.has(c.id)))
    if (selected && deleted.has(selected.id)) closeDetail()
    clearSelection()
    setBulkDeleting(false)
    if (deleted.size) notifyDataChanged('contact')
    const n = deleted.size
    showToast(n === ids.length
      ? `${n} contacto${n !== 1 ? 's' : ''} eliminado${n !== 1 ? 's' : ''}`
      : `Se eliminaron ${n} de ${ids.length}. Intenta de nuevo con el resto.`)
  }

  return (
    <>
      <div className="section-head">
        {someChecked ? (
          /* ── Barra de selección ── */
          <>
            <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={clearSelection}>
              <Ico.xmark /> Cancelar
            </button>
            <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>
              {checkedIds.size} seleccionado{checkedIds.size !== 1 ? 's' : ''}
            </span>
            {!confirmBulkDel ? (
              <div className="section-actions">
                {canCampaign && !readonly && (
                  <button className="btn" style={{ background: '#1B9E4B', color: '#fff' }} onClick={() => setShowWhatsAppCampaign(true)}>
                    <Ico.whatsapp /> Enviar WhatsApp
                  </button>
                )}
                {!readonly && (
                  <button className="btn btn-danger" onClick={() => setConfirmBulkDel(true)}>
                    <Ico.trash /> Eliminar {checkedIds.size}
                  </button>
                )}
              </div>
            ) : (
              <div className="section-actions">
                <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                  ¿Eliminar {checkedIds.size} contacto{checkedIds.size !== 1 ? 's' : ''}? No se puede deshacer.
                </span>
                <button className="btn btn-ghost" onClick={() => setConfirmBulkDel(false)} disabled={bulkDeleting}>No</button>
                <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting} style={{ minWidth: 100 }}>
                  {bulkDeleting ? 'Eliminando…' : 'Sí, eliminar'}
                </button>
              </div>
            )}
          </>
        ) : (
          /* ── Cabecera normal ── */
          <>
            <h2>Contactos</h2>
            {!loading && <span className="count">{filtersOn ? `${filtered.length} de ${contacts.length}` : contacts.length.toLocaleString('es-MX')}</span>}
            <div className="section-actions">
              {!readonly && <button className="btn btn-ghost" onClick={() => setShowImport(true)} title="Importar desde Excel o CSV"><Ico.upload /> <span className="hide-sm">Importar</span></button>}
              <button className="btn btn-ghost" onClick={() => setShowExport(true)} disabled={!contacts.length} title="Exportar a Excel"><Ico.download /> <span className="hide-sm">Exportar</span></button>
              {!readonly && <button className="btn btn-primary page-primary" onClick={() => openQuickCreate({ kind: 'contact' })}><Ico.plus /> Nuevo contacto</button>}
            </div>
          </>
        )}
      </div>

      <div className="list-controls">
        <label className="list-search">
          <Ico.search />
          <input placeholder="Buscar por nombre, teléfono, empresa…" value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setSearch('') }} />
          {search && <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda">×</button>}
        </label>
        <div className="filter-bar">
          {segmentOptions.length > 0 && (
            <FilterDropdown value={segF} options={segmentOptions} onChange={setSegF}
              countFor={v => v === 'Todos' ? contacts.length : (segmentCounts.get(v) ?? 0)}
              triggerLabel={v => v === 'Todos' ? 'Segmento' : v} optionLabel={v => v === 'Todos' ? 'Todos los segmentos' : v} searchPlaceholder="Buscar segmento…" />
          )}
          {canalOptions.length > 0 && (
            <FilterDropdown value={canalF} options={canalOptions} onChange={setCanalF}
              countFor={v => v === 'Todos' ? contacts.length : (canalCounts.get(v) ?? 0)}
              triggerLabel={v => v === 'Todos' ? 'Canal' : v} optionLabel={v => v === 'Todos' ? 'Todos los canales' : v} searchPlaceholder="Buscar canal…" />
          )}
          {landlineIds.size > 0 && (
            <button className={`filter-pill ${onlyLandlines ? 'active' : ''}`} onClick={() => setOnlyLandlines(v => !v)}
              title="Números que parecen de teléfono fijo: no reciben WhatsApp">
              📞 Posibles fijos <span className="count">{landlineIds.size}</span>
            </button>
          )}
          {(segF !== 'Todos' || canalF !== 'Todos' || onlyLandlines) && (
            <button className="filter-pill" onClick={() => { setSegF('Todos'); setCanalF('Todos'); setOnlyLandlines(false) }}>Limpiar filtros</button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {filtersOn
            ? <>Ningún contacto coincide. <button className="link-btn" onClick={clearFilters}>Quitar filtros</button>{!readonly && search.trim() && <> · <button className="link-btn" onClick={() => {
                const digits = search.replace(/\D/g, '')
                openQuickCreate(digits.length >= 7 ? { kind: 'contact', phone: digits } : { kind: 'contact', name: search.trim() })
              }}>Crear “{search.trim()}”</button></>}</>
            : <>Aún no tienes contactos.{!readonly && <> <button className="link-btn" onClick={() => setShowImport(true)}>Importa tu Excel</button> o <button className="link-btn" onClick={() => openQuickCreate({ kind: 'contact' })}>crea el primero</button>.</>}</>}
        </div>
      ) : (
        <div className="table-wrap contacts-table">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 44, paddingRight: 0 }}>
                  <input type="checkbox" checked={allFilteredChecked} onChange={toggleAll} title="Seleccionar todos" aria-label="Seleccionar todos"
                    style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer', display: 'block', margin: '0 auto' }} />
                </th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Segmento</th>
                <th>Canal</th>
                <th className="col-secondary">Registro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const isChecked = checkedIds.has(c.id)
                return (
                  <tr key={c.id}
                    onClick={e => { if (someChecked) toggleCheck(c.id, idx, e.shiftKey); else setSelected(c) }}
                    style={{ background: isChecked ? 'var(--brand-softer)' : undefined, userSelect: 'none' }}>
                    <td style={{ width: 44, paddingRight: 0 }} onClick={e => { e.stopPropagation(); toggleCheck(c.id, idx, e.shiftKey) }}>
                      <input type="checkbox" checked={isChecked} onChange={() => {}} aria-label={`Seleccionar ${c.name}`}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer', display: 'block', margin: '0 auto', pointerEvents: 'none' }} />
                    </td>
                    <td>
                      <div className="cell-name">
                        <Avatar name={c.name} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div className="nm">{c.name}</div>
                          {(() => {
                            const sub = c.company && c.company !== c.name ? c.company : c.email
                            return sub ? <div className="em">{sub}</div> : null
                          })()}
                        </div>
                      </div>
                    </td>
                    <td data-label="Teléfono" className="cell-mono" style={{ whiteSpace: 'nowrap' }}>
                      {fmtPhone(c.phone)}
                      {landlineIds.has(c.id) && <span className="tag-muted" title="Parece teléfono fijo: no recibe WhatsApp">Fijo</span>}
                    </td>
                    <td data-label="Segmento">{c.segment ? <TipoChip value={c.segment} small /> : <span className="cell-muted">—</span>}</td>
                    <td data-label="Canal">{c.acquisition_channel ? <CanalChip value={c.acquisition_channel} small /> : <span className="cell-muted">—</span>}</td>
                    <td data-label="Registro" className="cell-muted col-secondary" style={{ whiteSpace: 'nowrap' }}>{fmtDateLong(c.created_at?.slice(0, 10) || '')}</td>
                    <td className="cell-chevron" style={{ width: 40, textAlign: 'right' }}>
                      {isChecked ? <Ico.check /> : <Ico.chevron />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <ContactDetail
          key={selected.id}
          contact={selected}
          readonly={readonly}
          waModule={waModule}
          onClose={closeDetail}
          onUpdated={updated => {
            setSelected(updated)
            setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
            notifyDataChanged('contact')
            showToast('Contacto actualizado')
          }}
          onDeleted={id => {
            closeDetail()
            setContacts(prev => prev.filter(c => c.id !== id))
            notifyDataChanged('contact')
            showToast('Contacto eliminado')
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={(msg) => { setShowImport(false); load(); notifyDataChanged('contact'); showToast(msg) }}
        />
      )}

      {showExport && (
        <ExportModal all={contacts} visible={filtered} filtered={filtersOn} onClose={() => setShowExport(false)} />
      )}

      {showWhatsAppCampaign && (
        <WhatsAppCampaignModal
          contactIds={[...checkedIds]}
          contacts={contacts}
          onClose={() => setShowWhatsAppCampaign(false)}
          onDone={() => { setShowWhatsAppCampaign(false); clearSelection() }}
        />
      )}

      {toast && (
        <div className="toast-fixed">
          <Ico.check />
          {toast}
        </div>
      )}
    </>
  )
}

function countBy(list: any[], key: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const item of list) if (item[key]) m.set(item[key], (m.get(item[key]) ?? 0) + 1)
  return m
}

/* ── Ficha del contacto ── */
function ContactDetail({ contact: c, readonly, waModule, onClose, onUpdated, onDeleted }: {
  contact: any; readonly: boolean; waModule: boolean
  onClose: () => void
  onUpdated: (c: any) => void; onDeleted: (id: string) => void
}) {
  const { segments, canales } = useCatalogs()
  const [leads, setLeads]         = useState<any[] | null>(null)
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [editing, setEditing]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [editForm, setEditForm]   = useState({
    name: c.name || '', phone: normalizePhone(c.phone), email: c.email || '',
    company: c.company || '', segment: c.segment || '',
    acquisition_channel: c.acquisition_channel || '',
    address: c.address || '', postal_code: c.postal_code || '',
  })
  const [saveError, setSaveError] = useState('')
  const phone = normalizePhone(c.phone)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal')) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Leads de este contacto + recordatorios pendientes: los de sus leads (de
  // cualquier persona del equipo) y los tuyos sin lead que llevan su nombre
  const loadFollowUp = useCallback(async () => {
    const params = new URLSearchParams({ contact_id: c.id })
    if (phone.length === 10) params.set('phone', phone)
    const [l, own] = await Promise.all([
      fetch(`/api/data/leads?${params}`).then(res => res.json()).catch(() => ({ leads: [] })),
      fetch('/api/data/reminders').then(res => res.json()).catch(() => ({ reminders: [] })),
    ])
    const list: any[] = l.leads || []
    const perLead = await Promise.all(list.slice(0, 10).map(x =>
      fetch(`/api/data/reminders?lead_id=${x.id}`).then(res => res.json()).then(d => d.reminders ?? []).catch(() => []),
    ))
    const name = normText(c.name)
    const general = (own.reminders || []).filter((x: Reminder) => !x.lead_id && normText(x.lead_name) === name)
    setLeads(list)
    setReminders([...perLead.flat(), ...general]
      .filter((x: Reminder) => !x.completado)
      .sort((a: Reminder, b: Reminder) => a.fecha_recordatorio.localeCompare(b.fecha_recordatorio)))
  }, [c.id, c.name, phone])

  useEffect(() => { loadFollowUp() }, [loadFollowUp])
  useDataChanged(['lead', 'reminder'], loadFollowUp)

  const openLead = (leads ?? []).find(l => isOpenLead(l.estado))
  const upd = (k: keyof typeof editForm, v: string) => setEditForm(f => ({ ...f, [k]: v }))
  const phoneErr = editForm.phone.length > 0 && editForm.phone.length < 10
  const canSaveEdit = editForm.name.trim() && editForm.phone.length === 10
    && (!segments.length || !!editForm.segment) && (!canales.length || !!editForm.acquisition_channel)
  const opt = (list: string[], current: string) => current && !list.includes(current) ? [current, ...list] : list

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    const r = await fetch(`/api/data/contacts/${c.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, phone: normalizePhone(editForm.phone) }),
    })
    if (r.ok) {
      const updated = await r.json()
      onUpdated(Array.isArray(updated) ? updated[0] : updated)
      setEditing(false)
    } else {
      const d = await r.json().catch(() => ({}))
      setSaveError(d.error || 'Error al guardar los cambios')
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const r = await fetch(`/api/data/contacts/${c.id}`, { method: 'DELETE' })
    if (r.ok) onDeleted(c.id)
    else setDeleting(false)
  }

  const completeReminder = async (id: string) => {
    const r = await fetch(`/api/data/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completado: true }) })
    if (r.ok) notifyDataChanged('reminder')
  }

  const scheduleFollowUp = () => openQuickCreate({
    kind: 'reminder',
    defaults: openLead
      ? { lead_id: openLead.id, lead_name: openLead.name, type: 'call', nota: `Dar seguimiento a ${firstName(c.name)}` }
      : { lead_id: null, lead_name: c.name, type: 'call', nota: `Llamar a ${firstName(c.name)}` },
  })
  const contactLite = { id: c.id, name: c.name, phone: c.phone, email: c.email, company: c.company, segment: c.segment, acquisition_channel: c.acquisition_channel }
  const now = new Date()

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="detail" aria-label={`Contacto ${c.name}`}>
        <div className="detail-head">
          <button className="detail-close" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
          <div className="detail-kicker">Contacto</div>
          <div className="detail-title">{c.name}</div>
          <div className="detail-meta">
            {c.segment && <TipoChip value={c.segment} small />}
            {c.acquisition_channel && <CanalChip value={c.acquisition_channel} small />}
            <span className="cell-muted">Cliente desde {fmtDateLong(c.created_at?.slice(0, 10) || '')}</span>
          </div>
        </div>

        <div className="detail-body">
          {editing ? (
            <div className="detail-section">
              <h4>Editar contacto</h4>
              <div className="field">
                <label>Nombre *</label>
                <input value={editForm.name} onChange={e => upd('name', e.target.value)} maxLength={200} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Celular * <span className="label-muted">(10 dígitos)</span></label>
                  <input value={editForm.phone} onChange={e => upd('phone', phoneDigits(e.target.value))} maxLength={10} inputMode="numeric"
                    style={phoneErr ? { borderColor: 'var(--danger)' } : undefined} />
                  {phoneErr && <div className="field-error">Debe tener 10 dígitos</div>}
                </div>
                <div className="field">
                  <label>Correo</label>
                  <input value={editForm.email} onChange={e => upd('email', e.target.value)} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Segmento{segments.length ? ' *' : ''}</label>
                  <select value={editForm.segment} onChange={e => upd('segment', e.target.value)}>
                    <option value="">— Elegir —</option>
                    {opt(segments, editForm.segment).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>¿Cómo nos conoció?{canales.length ? ' *' : ''}</label>
                  <select value={editForm.acquisition_channel} onChange={e => upd('acquisition_channel', e.target.value)}>
                    <option value="">— Elegir —</option>
                    {opt(canales, editForm.acquisition_channel).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Empresa</label>
                <input value={editForm.company} onChange={e => upd('company', e.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Dirección</label>
                  <input value={editForm.address} onChange={e => upd('address', e.target.value)} maxLength={500} />
                </div>
                <div className="field">
                  <label>C.P.</label>
                  <input value={editForm.postal_code} onChange={e => upd('postal_code', e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} />
                </div>
              </div>
              {saveError && <div className="field-error" style={{ marginBottom: 8 }}>{saveError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</button>
                <button className="btn btn-primary" disabled={!canSaveEdit || saving} onClick={handleSave} style={{ flex: 1 }}>
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Seguimiento: leads + recordatorios ── */}
              <div className="detail-section">
                <div className="detail-section-head">
                  <h4>Leads {leads ? `(${leads.length})` : ''}</h4>
                  {!readonly && <button className="link-btn" onClick={() => openQuickCreate({ kind: 'lead', contact: contactLite })}><Ico.plus /> Nuevo lead</button>}
                </div>
                {leads === null ? null : leads.length === 0 ? (
                  <div className="empty-state small" style={{ textAlign: 'left', padding: '4px 0' }}>
                    Sin leads. Registra uno cuando pida una cotización.
                  </div>
                ) : (
                  <div className="mini-cards">
                    {leads.map((l: any) => (
                      <Link key={l.id} href={`/leads?id=${l.id}`} className="mini-card">
                        <span className="mini-card-top">
                          <EstadoChip value={l.estado || 'Nuevo'} small />
                          {l.monto ? <strong>${Number(l.monto).toLocaleString('es-MX')}</strong> : null}
                        </span>
                        <span className="mini-card-sub">
                          {l.canal || 'Sin canal'} · {fmtDateLong(String(l.fecha || l.created_at).slice(0, 10))}
                          {isOpenLead(l.estado) && (!l.next_reminder_at
                            ? <> · <span style={{ color: 'var(--warning)' }}>sin seguimiento</span></>
                            : isOverdue(l.next_reminder_at, now)
                              ? <> · <span style={{ color: 'var(--danger)' }}>seguimiento vencido</span></>
                              : <> · Seguimiento {fmtDue(l.next_reminder_at, now).toLowerCase()}</>)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="detail-section">
                <div className="detail-section-head">
                  <h4>Seguimientos pendientes</h4>
                  {!readonly && <button className="link-btn" onClick={scheduleFollowUp}><Ico.plus /> Programar</button>}
                </div>
                {reminders.length === 0 ? (
                  <div className="empty-state small" style={{ textAlign: 'left', padding: '4px 0' }}>Nada programado con este cliente.</div>
                ) : reminders.map(r => (
                  <div key={r.id} className={`rem-row ${isOverdue(r.fecha_recordatorio, now) ? 'overdue' : ''}`}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="rem-row-when">{fmtDue(r.fecha_recordatorio, now)}</div>
                      <div className="rem-row-text">{reminderTitle(r)}</div>
                      {r.mine === false && <div className="rem-row-owner">De {r.owner_name}</div>}
                    </div>
                    {!readonly && r.mine !== false && <button className="notif-done" onClick={() => completeReminder(r.id)}>✓ Listo</button>}
                  </div>
                ))}
              </div>

              {waModule && phone.length === 10 && <ContactWhatsApp contact={c} readonly={readonly} onUpdated={onUpdated} />}

              <div className="detail-section">
                <div className="detail-section-head">
                  <h4>Datos</h4>
                  {!readonly && <button className="link-btn" onClick={() => { setEditing(true); setConfirmDel(false) }}><Ico.edit /> Editar</button>}
                </div>
                <div className="kv-grid">
                  <div className="kv"><div className="k">Teléfono</div><div className="v" style={{ fontFamily: 'var(--font-mono)' }}>{fmtPhone(c.phone) || '—'}</div></div>
                  <div className="kv"><div className="k">Correo</div><div className="v" style={{ fontSize: 13, wordBreak: 'break-all' }}>{c.email || '—'}</div></div>
                  <div className="kv"><div className="k">Empresa</div><div className="v">{c.company || '—'}</div></div>
                  <div className="kv"><div className="k">Canal</div><div className="v">{c.acquisition_channel || '—'}</div></div>
                  <div className="kv" style={{ gridColumn: '1 / -1' }}><div className="k">Dirección</div><div className="v" style={{ fontSize: 13 }}>{c.address || '—'}{c.postal_code ? ` · C.P. ${c.postal_code}` : ''}</div></div>
                </div>
              </div>

              {!readonly && (
                confirmDel ? (
                  <div className="danger-box">
                    <div className="danger-title">¿Eliminar este contacto?</div>
                    <div className="danger-text">Esta acción no se puede deshacer.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} style={{ flex: 1 }}>Cancelar</button>
                      <button className="btn btn-danger" onClick={handleDelete} disabled={deleting} style={{ flex: 1 }}>{deleting ? 'Eliminando…' : 'Sí, eliminar'}</button>
                    </div>
                  </div>
                ) : (
                  <button className="link-btn danger" onClick={() => setConfirmDel(true)}><Ico.trash /> Eliminar contacto</button>
                )
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="detail-foot">
            {phone && <a href={`tel:${phone}`} className="btn btn-ghost btn-ghost-call"><Ico.phone /> Llamar</a>}
            {waModule && phone.length === 10 && (
              <Link href={`/whatsapp?phone=${phone}`} className="btn btn-ghost btn-ghost-whatsapp"><Ico.whatsapp /> WhatsApp</Link>
            )}
            {c.email && <a href={`mailto:${c.email}`} className="btn btn-ghost btn-ghost-mail"><Ico.mail /> Correo</a>}
          </div>
        )}
      </aside>
    </>
  )
}

/* ── WhatsApp dentro de la ficha: últimos mensajes, ventana de 24 h y campañas ── */
function ContactWhatsApp({ contact: c, readonly, onUpdated }: { contact: any; readonly: boolean; onUpdated: (c: any) => void }) {
  const phone = normalizePhone(c.phone)
  const [data, setData] = useState<{ messages: any[]; lastInboundAt: string | null } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/whatsapp/conversations/${phone}?preview=1&limit=3`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setData(d ? { messages: d.messages ?? [], lastInboundAt: d.lastInboundAt } : { messages: [], lastInboundAt: null }))
      .catch(() => setData({ messages: [], lastInboundAt: null }))
  }, [phone])

  const toggleOptOut = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/data/contacts/${c.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wa_opt_out: !c.wa_opt_out }),
      })
      if (r.ok) { const d = await r.json(); onUpdated(Array.isArray(d) ? d[0] : d) }
    } finally { setSaving(false) }
  }

  return (
    <div className="detail-section">
      <div className="detail-section-head">
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>WhatsApp {data && <WindowBadge lastInboundAt={data.lastInboundAt} />}</h4>
        <Link href={`/whatsapp?phone=${phone}`} className="link-btn"><Ico.whatsapp /> Abrir chat</Link>
      </div>
      <div className="wa-mini">
        {data === null ? (
          <div className="wa-thread-loading" style={{ padding: 18 }}><span className="wa-spinner sm" /></div>
        ) : data.messages.length === 0 ? (
          <div className="wa-muted-box" style={{ margin: 10 }}>Aún no hay conversación de WhatsApp con este contacto.</div>
        ) : (
          <div className="wa-mini-msgs">
            {data.messages.map(m => (
              <div key={m.id} className={`wa-msg ${m.direction === 'outbound' ? 'out' : 'in'} ${m.status === 'failed' ? 'failed' : ''}`}>
                <div className="wa-bubble">
                  <div className="wa-text">{(m.media_id ? mediaCaption(m.body) || m.body : m.body) || '—'}</div>
                  <div className="wa-meta"><span>{fmtTime(m.created_at)}</span>{m.direction === 'outbound' && <StatusTicks status={m.status} />}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="wa-mini-foot">
          <label className="wa-check-row" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={!c.wa_opt_out} onChange={toggleOptOut} disabled={saving || readonly} />
            <span>Recibe campañas de WhatsApp</span>
          </label>
        </div>
      </div>
    </div>
  )
}

/* ── Exportar a Excel: lo que estás viendo o toda la base ── */
function ExportModal({ all, visible, filtered, onClose }: { all: any[]; visible: any[]; filtered: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'visible' | 'all'>(filtered ? 'visible' : 'all')
  const data = mode === 'visible' ? visible : all

  const doExport = async () => {
    const rows = data.map(c => ({
      'Nombre':         c.name || '',
      'Teléfono':       normalizePhone(c.phone),
      'Para SMS (52+)': c.phone ? `52${normalizePhone(c.phone)}` : '',
      'Correo':         c.email || '',
      'Empresa':        c.company || '',
      'Segmento':       c.segment || '',
      'Canal':          c.acquisition_channel || '',
      'Dirección':      c.address || '',
      'C.P.':           c.postal_code || '',
      'Fecha registro': c.created_at?.slice(0, 10) || '',
    }))
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Contactos')
    XLSX.writeFile(wb, `contactos${mode === 'visible' && filtered ? '-filtrados' : ''}-${new Date().toLocaleDateString('en-CA')}.xlsx`)
    onClose()
  }

  const option = (key: 'visible' | 'all', title: string, sub: string) => (
    <label className={`radio-card ${mode === key ? 'active' : ''}`}>
      <input type="radio" checked={mode === key} onChange={() => setMode(key)} />
      <span><strong>{title}</strong><small>{sub}</small></span>
    </label>
  )

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Exportar a Excel</h3>
          <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered && option('visible', `Los ${visible.length.toLocaleString('es-MX')} que estás viendo`, 'Con la búsqueda y los filtros actuales')}
            {option('all', 'Toda la base', `${all.length.toLocaleString('es-MX')} contactos`)}
          </div>
          <div className="soft-note" style={{ marginTop: 14, marginBottom: 0 }}>
            Columnas: nombre, teléfono, teléfono para SMS, correo, empresa, segmento, canal, dirección, C.P. y fecha de registro.
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={doExport} disabled={data.length === 0}>
            <Ico.download /> Descargar {data.length.toLocaleString('es-MX')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Modal de campaña de WhatsApp — plantilla + vista previa + envío a los contactos elegidos ── */
function WhatsAppCampaignModal({
  contactIds, contacts, onClose, onDone,
}: {
  contactIds: string[]; contacts: any[]; onClose: () => void; onDone: () => void
}) {
  const [selection, setSelection] = useState<WhatsAppTemplateSelection | null>(null)
  const { quota, refetch: refetchQuota } = useWhatsAppCampaignQuota()
  const { phase, total, done, sent, failed, skipped, outcomes, stopReason, askConfirm, backToForm, run, cancel } = useCampaignSend()

  const ids = new Set(contactIds)
  const chosen = contacts.filter(c => ids.has(c.id))
  // Los dados de baja nunca reciben campañas (el servidor también lo valida)
  const selectedContacts = chosen.filter(c => !c.wa_opt_out)
  const optedOut = chosen.length - selectedContacts.length
  const exampleName = (selectedContacts[0]?.name || 'Cliente').trim().split(/\s+/)[0]

  const overQuota = !!quota && selectedContacts.length > quota.remaining
  const canSend = !!selection?.ready && selectedContacts.length > 0 && !overQuota
  const busy = phase === 'sending'

  const handleConfirmed = async () => {
    if (!selection) return
    await run(selectedContacts.map(c => ({ id: c.id, name: c.name, phone: c.phone })), selection)
    refetchQuota()
  }

  return (
    <div className="modal" onClick={busy ? undefined : onClose}>
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Enviar plantilla de WhatsApp</h3>
          {!busy && <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>}
        </div>

        <div className="modal-body">
          {phase === 'results' ? (
            <CampaignResultsPanel sent={sent} skipped={skipped} failed={failed} outcomes={outcomes} stopReason={stopReason} onDone={onDone} />
          ) : phase === 'sending' ? (
            <CampaignProgressPanel total={total} done={done} sent={sent} failed={failed} skipped={skipped} onCancel={cancel} />
          ) : phase === 'confirm' ? (
            <CampaignConfirmPanel
              targetCount={selectedContacts.length} selection={selection} quota={quota}
              onConfirm={handleConfirmed} onCancel={backToForm}
            />
          ) : (
            <>
              <WhatsAppTemplatePicker exampleName={exampleName} onChange={setSelection} />
              <div className="wa-quota" style={{ marginTop: 14 }}>
                Se enviará a <strong>{selectedContacts.length}</strong> contacto{selectedContacts.length !== 1 ? 's' : ''} seleccionado{selectedContacts.length !== 1 ? 's' : ''}.
                {optedOut > 0 && <> Se omiten <strong>{optedOut}</strong> que pidieron no recibir campañas.</>}
                {' '}Quien ya recibió esta plantilla en los últimos 7 días también se omite automáticamente.
              </div>
              <CampaignQuotaNote quota={quota} selectedCount={selectedContacts.length} />
            </>
          )}
        </div>

        {phase === 'idle' && (
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={askConfirm} disabled={!canSend}>
              <Ico.send /> Enviar a {selectedContacts.length}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Modal de importación CSV/XLSX (con previsualización y solo celulares) ── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (summary: string) => void }) {
  type Step = 'drop' | 'map' | 'preview' | 'importing'
  const [step, setStep]         = useState<Step>('drop')
  const [rows, setRows]         = useState<any[]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [mapping, setMapping]   = useState<Record<string, string>>({})
  const [progress, setProgress] = useState(0)
  const [total, setTotal]       = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError]       = useState('')
  const [preview, setPreview]   = useState<{
    valid: any[]; landlines: number; invalid: number; noName: number
  } | null>(null)

  // Sugerir el mapeo por el nombre de la columna (Nombre, Teléfono, Correo…)
  const autoMap = (hdrs: string[]) => {
    const guesses: Record<string, string[]> = {
      name: ['nombre', 'name', 'cliente', 'razon social'], phone: ['telefono', 'celular', 'movil', 'phone', 'whatsapp', 'tel'],
      email: ['correo', 'email', 'mail'], company: ['empresa', 'compania', 'negocio'], address: ['direccion', 'domicilio'],
      postal_code: ['cp', 'c.p.', 'codigo postal'], segment: ['segmento', 'tipo', 'giro'], acquisition_channel: ['canal', 'origen', 'fuente'],
    }
    const next: Record<string, string> = {}
    for (const [dest, keys] of Object.entries(guesses)) {
      const hit = hdrs.find(h => keys.some(k => normText(h) === k || normText(h).startsWith(k)))
      if (hit) next[dest] = hit
    }
    setMapping(next)
  }

  const parseFile = async (file: File) => {
    setError('')
    if (file.size > 10 * 1024 * 1024) { setError('El archivo excede 10 MB.'); return }
    if (file.name.match(/\.xlsx?$/i)) {
      try {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer())
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
        if (data.length < 2) { setError('El archivo no tiene filas de datos.'); return }
        const hdrs = data[0].map(h => String(h ?? '').trim())
        const dataRows = data.slice(1).map(row => {
          const obj: any = {}
          hdrs.forEach((h, i) => { obj[h] = row[i] ?? '' })
          return obj
        }).filter(r => Object.values(r).some(v => v !== ''))
        setHeaders(hdrs); setRows(dataRows); autoMap(hdrs); setStep('map')
      } catch { setError('No se pudo leer el archivo Excel.') }
    } else {
      const Papa = (await import('papaparse')).default
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: res => {
          if (!res.data.length) { setError('El CSV no tiene datos.'); return }
          const hdrs = Object.keys(res.data[0] as object)
          setHeaders(hdrs); setRows(res.data as any[]); autoMap(hdrs); setStep('map')
        },
        error: () => setError('No se pudo leer el CSV.'),
      })
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  const buildPreview = () => {
    let landlines = 0, invalid = 0, noName = 0
    const valid: any[] = []
    for (const row of rows) {
      const contact: any = {}
      CAMPOS_DESTINO.forEach(dest => {
        const src = mapping[dest]
        if (src && row[src] !== undefined) contact[dest] = String(row[src]).trim()
      })
      if (!contact.name?.trim()) { noName++; continue }
      const raw = contact.phone || ''
      const normalized = normalizePhone(raw)
      if (!raw || normalized.length !== 10) { invalid++; continue }
      if (!isMobilePhone(normalized)) { landlines++; continue }
      contact.phone = normalized
      valid.push(contact)
    }
    setPreview({ valid, landlines, invalid, noName })
    setStep('preview')
  }

  // Importación por lotes de 200. Los teléfonos ya registrados se omiten en el servidor.
  const doImport = async () => {
    if (!preview) return
    setStep('importing'); setTotal(preview.valid.length); setProgress(0)
    let inserted = 0, duplicates = 0, failed = 0, done = 0
    for (let i = 0; i < preview.valid.length; i += 200) {
      const chunk = preview.valid.slice(i, i + 200)
      try {
        const r = await fetch('/api/data/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: chunk }),
        })
        const d = await r.json().catch(() => ({}))
        if (r.ok) { inserted += d.inserted ?? 0; duplicates += d.duplicates ?? 0; failed += d.invalid ?? 0 }
        else failed += chunk.length
      } catch { failed += chunk.length }
      done += chunk.length; setProgress(done)
    }
    const parts = [`${inserted} importado${inserted !== 1 ? 's' : ''}`]
    if (duplicates) parts.push(`${duplicates} ya existían`)
    if (failed) parts.push(`${failed} con error`)
    onDone(`Importación: ${parts.join(' · ')}`)
  }

  const titleMap: Record<Step, string> = {
    drop: 'Importar contactos', map: 'Relaciona las columnas',
    preview: 'Revisa antes de importar', importing: 'Importando…',
  }

  return (
    <div className="modal" onClick={step === 'importing' ? undefined : onClose}>
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{titleMap[step]}</h3>
          {step !== 'importing' && <button className="modal-close btn-icon" onClick={onClose} aria-label="Cerrar"><Ico.close /></button>}
        </div>
        <div className="modal-body">
          {step === 'drop' && (
            <>
              <label className={`import-drop ${dragging ? 'over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Arrastra un archivo CSV o Excel</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>o haz clic para seleccionar</div>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
              </label>
              <div className="soft-note" style={{ marginTop: 12, marginBottom: 0 }}>
                Solo se importan números <strong>celulares</strong> (los que pueden recibir WhatsApp). Los fijos, los inválidos y los que ya están registrados se omiten solos.
              </div>
              {error && <div className="field-error" style={{ marginTop: 10 }}>{error}</div>}
            </>
          )}
          {step === 'map' && (
            <>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0, marginBottom: 14 }}>
                Indica qué columna del archivo <strong>({rows.length} filas)</strong> corresponde a cada dato. Ya sugerimos las que reconocimos.
              </p>
              <div>
                {CAMPOS_DESTINO.map(dest => (
                  <div className="map-row" key={dest}>
                    <span className="map-label">{CAMPO_LABELS[dest]}{dest === 'name' || dest === 'phone' ? ' *' : ''}</span>
                    <select className="map-select" value={mapping[dest] || ''} onChange={e => setMapping(m => ({ ...m, [dest]: e.target.value }))}>
                      <option value="">— ignorar —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 'preview' && preview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '14px 16px', background: 'var(--success-soft)', border: '1px solid #BDE7C9', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--success-fill)', lineHeight: 1 }}>{preview.valid.length}</div>
                  <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>Celulares válidos</div>
                  <div style={{ fontSize: 11, color: 'var(--success-fill)', marginTop: 2 }}>Se importarán</div>
                </div>
                <div style={{ padding: '14px 16px', background: 'var(--danger-soft)', border: '1px solid #F7C1C9', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--danger)', lineHeight: 1 }}>{preview.landlines + preview.invalid + preview.noName}</div>
                  <div style={{ fontSize: 12, color: '#7A0A18', marginTop: 4, fontWeight: 600 }}>Se omitirán</div>
                  <div style={{ fontSize: 11, color: '#E8798A', marginTop: 2 }}>Fijos, sin nombre o inválidos</div>
                </div>
              </div>
              {(preview.landlines > 0 || preview.invalid > 0 || preview.noName > 0) && (
                <div style={{ padding: '10px 14px', background: 'var(--paper)', borderRadius: 9, fontSize: 12.5, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {preview.landlines > 0 && <span>📞 <strong>{preview.landlines}</strong> número{preview.landlines !== 1 ? 's' : ''} fijo{preview.landlines !== 1 ? 's' : ''}</span>}
                  {preview.invalid > 0  && <span>⚠️ <strong>{preview.invalid}</strong> teléfono{preview.invalid !== 1 ? 's' : ''} con formato inválido</span>}
                  {preview.noName > 0   && <span>👤 <strong>{preview.noName}</strong> fila{preview.noName !== 1 ? 's' : ''} sin nombre</span>}
                </div>
              )}
              {preview.valid.length === 0 && (
                <div style={{ padding: '12px', background: 'var(--danger-soft)', borderRadius: 9, fontSize: 13, color: 'var(--danger)', textAlign: 'center', fontWeight: 500 }}>
                  No hay contactos válidos para importar en este archivo.
                </div>
              )}
            </div>
          )}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Importando {progress} de {total}…</div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}></div></div>
            </div>
          )}
        </div>
        {step !== 'importing' && (
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={
              step === 'preview' ? () => setStep('map')
              : step === 'map' ? () => setStep('drop')
              : onClose
            }>
              {step === 'drop' ? 'Cancelar' : 'Volver'}
            </button>
            {step === 'map' && (
              <button className="btn btn-primary" onClick={buildPreview} disabled={!mapping.name || !mapping.phone}>
                Revisar →
              </button>
            )}
            {step === 'preview' && preview && preview.valid.length > 0 && (
              <button className="btn btn-primary" onClick={doImport}>
                <Ico.plus /> Importar {preview.valid.length} celulares
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
