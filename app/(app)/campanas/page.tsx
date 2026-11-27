'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { useSession } from '@/lib/profile'
import { CampaignHome } from './Home'
import { CampaignResult } from './Result'
import { CampaignWizard, type WizardStart } from './Wizard'
import { CampaignsPageSkeleton } from './Skeletons'
import type { CampaignBundle } from '@/lib/campaignGroups'

export default function CampanasPage() {
  return <Suspense fallback={<CampaignsPageSkeleton />}><Campanas /></Suspense>
}

/**
 * Campañas: un mismo mensaje de WhatsApp para muchos clientes. El inicio
 * lista lo enviado; «Nueva campaña» abre el asistente de 3 pasos y cada
 * campaña abre sus resultados (?c=). Solo administradores de tiendas con el
 * módulo; los chats están en Conversaciones.
 */
function Campanas() {
  const session = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const opened = params.get('c')
  // Campaña junta: los envíos de la misma plantilla en el mismo día
  const bundle = params.get('g')
  const [wizard, setWizard] = useState<WizardStart | null>(null)
  // Desde Plantillas («Usar en una campaña»): el asistente abre con esa plantilla elegida
  const preset = params.get('plantilla')
  useEffect(() => {
    if (!preset || !/^[a-z0-9_]{1,512}\|[a-zA-Z_]{2,10}$/.test(preset)) return
    setWizard({ kind: 'new', template: preset })
    router.replace('/campanas', { scroll: false })
  }, [preset, router])

  if (session?.store && !session.store.modules.whatsapp) return <WhatsAppOffer />
  const off = !!session?.store && !session.store.modules.campaigns
  if (session && (off || !session.isAdmin)) {
    return (
      <div className="wa-card wa-empty small">
        <Megaphone size={22} aria-hidden="true" />
        {off ? 'Las campañas de WhatsApp no están activas en tu tienda.' : 'Las campañas las manejan los administradores de la tienda.'}
      </div>
    )
  }

  const open = (id: string) => router.push(`/campanas?c=${encodeURIComponent(id)}`, { scroll: true })
  const openBundle = (b: CampaignBundle) => (b.ids.length === 1 ? open(b.ids[0]) : router.push(`/campanas?g=${encodeURIComponent(b.key)}`, { scroll: true }))
  const home = () => router.push('/campanas', { scroll: true })

  // Mientras está abierto, el asistente cubre la pantalla (lo de abajo no se recarga con cada lote)
  if (wizard) {
    return (
      <CampaignWizard start={wizard} store={session?.store?.name ?? 'Tu tienda'}
        onClose={() => setWizard(null)}
        onResults={id => { setWizard(null); open(id) }} />
    )
  }

  if (opened || bundle) {
    return (
      <CampaignResult id={opened} group={bundle} onBack={home}
        onRetry={r => setWizard({ kind: 'retry', ...r })}
        onOpenChat={phone => router.push(`/whatsapp?phone=${phone}`)} />
    )
  }

  return <CampaignHome onStart={setWizard} onOpen={openBundle} />
}
