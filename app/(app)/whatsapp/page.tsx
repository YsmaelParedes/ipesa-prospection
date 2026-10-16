'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import WhatsAppInbox from '@/components/WhatsAppInbox'
import { WhatsAppCampaigns, type CampaignPreset } from '@/components/WhatsAppCampaigns'
import { WhatsAppCampaignResults } from '@/components/WhatsAppCampaignHistory'
import { WaIcon } from '@/components/WhatsAppUI'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { useSession } from '@/lib/profile'

type Tab = 'bandeja' | 'campanas' | 'resultados'

export default function WhatsAppPage() {
  const session = useSession()
  const router = useRouter()
  const isAdmin = !!session?.isAdmin
  // Las campañas son para administradores y se pueden apagar en Configuración → Herramientas
  const campaigns = isAdmin && (!session?.store || session.store.modules.campaigns)
  const [tab, setTab] = useState<Tab>('bandeja')
  const [retry, setRetry] = useState<CampaignPreset | null>(null)
  const current: Tab = campaigns ? tab : 'bandeja'

  // Tienda sin WhatsApp: presentación del servicio ("Por activar")
  if (session?.store && !session.store.modules.whatsapp) {
    return <div className="wa-page"><WhatsAppOffer /></div>
  }

  return (
    <div className="wa-page">
      {campaigns && (
        <nav className="wa-tabs" role="tablist" aria-label="Secciones de WhatsApp">
          {([
            ['bandeja', 'Bandeja', <WaIcon.chat key="i" />],
            ['campanas', 'Campañas', <WaIcon.megaphone key="i" />],
            ['resultados', 'Resultados', <WaIcon.chart key="i" />],
          ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={current === key} className={`wa-tab ${current === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {icon} {label}
            </button>
          ))}
        </nav>
      )}

      {current === 'bandeja' && (
        // useSearchParams (chat abierto vía ?phone=) requiere un límite de Suspense
        <Suspense fallback={<div className="wa-card wa-empty"><span className="wa-spinner" /></div>}>
          <WhatsAppInbox isAdmin={isAdmin} />
        </Suspense>
      )}
      {current === 'campanas' && <WhatsAppCampaigns preset={retry} onPresetApplied={() => setRetry(null)} onViewResults={() => setTab('resultados')} />}
      {current === 'resultados' && (
        <WhatsAppCampaignResults
          onRetry={r => { setRetry(r); setTab('campanas') }}
          onOpenChat={phone => { router.push(`/whatsapp?phone=${phone}`); setTab('bandeja') }}
        />
      )}
    </div>
  )
}
