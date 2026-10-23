'use client'

import { Suspense, useState } from 'react'
import { useRouter } from 'next/navigation'
import WhatsAppInbox from '@/components/WhatsAppInbox'
import { WhatsAppCampaigns, type CampaignPreset } from '@/components/WhatsAppCampaigns'
import { WhatsAppCampaignResults } from '@/components/WhatsAppCampaignHistory'
import { WaIcon } from '@/components/WhatsAppUI'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { WhatsAppAgent } from '@/components/WhatsAppAgent'
import { useSession } from '@/lib/profile'

type Tab = 'bandeja' | 'campanas' | 'resultados' | 'agente'

export default function WhatsAppPage() {
  const session = useSession()
  const router = useRouter()
  const isAdmin = !!session?.isAdmin
  // Campañas: extra aparte (solo tiendas con el módulo, encendido fuera de la plataforma) y solo administradores
  const campaigns = isAdmin && (!session?.store || session.store.modules.campaigns)
  const [tab, setTab] = useState<Tab>('bandeja')
  const [retry, setRetry] = useState<CampaignPreset | null>(null)
  const tabs = ([
    ['bandeja', 'Bandeja', <WaIcon.chat key="i" />],
    ...(campaigns ? [
      ['campanas', 'Campañas', <WaIcon.megaphone key="i" />],
      ['resultados', 'Resultados', <WaIcon.chart key="i" />],
    ] : []),
    // Agente de IA de Meta: lo configuran los administradores
    ...(isAdmin ? [['agente', 'Agente IA', <WaIcon.bolt key="i" />]] : []),
  ] as [Tab, string, React.ReactNode][])
  const current: Tab = tabs.some(([key]) => key === tab) ? tab : 'bandeja'

  // Tienda sin WhatsApp: presentación del servicio ("Por activar")
  if (session?.store && !session.store.modules.whatsapp) {
    return <div className="wa-page"><WhatsAppOffer /></div>
  }

  return (
    <div className="wa-page">
      {tabs.length > 1 && (
        <nav className="wa-tabs" role="tablist" aria-label="Secciones de WhatsApp">
          {tabs.map(([key, label, icon]) => (
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
      {current === 'agente' && <WhatsAppAgent />}
    </div>
  )
}
