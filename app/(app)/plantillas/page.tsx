'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, FileText } from 'lucide-react'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { useSession } from '@/lib/profile'
import { useCachedQuery } from '@/lib/useCachedQuery'
import type { ManagedTemplate } from '@/lib/whatsappTemplates'
import { TemplateList } from './List'
import { TemplateDetail } from './Detail'
import { TemplateEditor, type EditorStart } from './Editor'
import { TemplatesPageSkeleton } from './Skeletons'
import { keyOf, useTemplateStats } from './ui'

export default function PlantillasPage() {
  return <Suspense fallback={<TemplatesPageSkeleton />}><Plantillas /></Suspense>
}

/**
 * Plantillas de WhatsApp: la lista con su estado en WhatsApp, el detalle de
 * cada una (?t=nombre|idioma) y el editor para crear, corregir o duplicar
 * (?nueva=1 lo abre). Solo administradores de tiendas con WhatsApp.
 */
function Plantillas() {
  const session = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const opened = params.get('t')
  const allowed = !!session?.isAdmin && !!session?.store?.modules.whatsapp
  const { data, error, loading, updating, reload } = useCachedQuery<{ templates: ManagedTemplate[]; error?: string }>(allowed ? '/api/whatsapp/templates/manage' : null)
  const campaigns = !!session?.store?.modules.campaigns
  const stats = useTemplateStats(allowed && campaigns)
  const [editor, setEditor] = useState<EditorStart | null>(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const say = (text: string) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3600)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ?nueva=1 (desde Campañas): abre el editor y deja la dirección limpia
  const wantsNew = params.get('nueva') === '1'
  useEffect(() => {
    if (!wantsNew || !allowed) return
    setEditor({ mode: 'new' })
    router.replace('/plantillas', { scroll: false })
  }, [wantsNew, allowed, router])

  if (session?.store && !session.store.modules.whatsapp) return <WhatsAppOffer />
  if (session && !session.isAdmin) {
    return (
      <div className="wa-card wa-empty small">
        <FileText size={22} aria-hidden="true" />
        Las plantillas las manejan los administradores de la tienda.
      </div>
    )
  }

  const templates = data?.templates
  const store = session?.store?.name ?? 'Tu tienda'
  const open = (key: string) => router.push(`/plantillas?t=${encodeURIComponent(key)}`, { scroll: true })
  const home = () => router.push('/plantillas', { scroll: true })
  const current = opened ? templates?.find(t => keyOf(t) === opened) : undefined

  let view: React.ReactNode
  if (opened && current) {
    view = (
      <TemplateDetail t={current} store={store} stats={stats?.get(current.name)} campaigns={campaigns} onBack={home}
        onEdit={() => setEditor({ mode: 'edit', template: current })}
        onDuplicate={() => setEditor({ mode: 'copy', template: current })}
        onDeleted={() => { void reload(); home(); say('Plantilla eliminada') }} />
    )
  } else if (opened && loading) {
    view = <TemplatesPageSkeleton />
  } else {
    view = (
      <TemplateList templates={templates} error={data?.error ?? (error ? error.message || 'No se pudieron consultar tus plantillas' : '')}
        loading={loading} refreshing={updating} onReload={() => void reload()} stats={stats}
        onNew={() => setEditor({ mode: 'new' })} onOpen={open} />
    )
  }

  return (
    <>
      {view}
      {editor && (
        <TemplateEditor start={editor} templates={templates ?? []} store={store} storePhone={session?.store?.phone ?? ''}
          onClose={() => setEditor(null)}
          onSaved={key => { setEditor(null); void reload(); open(key); say('Enviada a revisión de WhatsApp') }} />
      )}
      {toast && <div className="toast-fixed" role="status"><span className="toast-check"><Check aria-hidden="true" /></span> {toast}</div>}
    </>
  )
}
