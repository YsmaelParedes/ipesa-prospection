'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { WhatsAppCampaigns, type CampaignPreset } from '@/components/WhatsAppCampaigns'
import { WhatsAppCampaignResults } from '@/components/WhatsAppCampaignHistory'
import { WaIcon } from '@/components/WhatsAppUI'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { useSession } from '@/lib/profile'

type Tab = 'campanas' | 'resultados'

/**
 * Campañas de Mkt: envíos por WhatsApp a muchos contactos y sus resultados.
 * Solo administradores de tiendas con el módulo; la Bandeja se queda en WhatsApp.
 */
export default function CampanasPage() {
  const session = useSession()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('campanas')
  const [retry, setRetry] = useState<CampaignPreset | null>(null)

  if (session?.store && !session.store.modules.whatsapp) return <div className="wa-page"><WhatsAppOffer /></div>
  const off = !!session?.store && !session.store.modules.campaigns
  if (session && (off || !session.isAdmin)) {
    return (
      <div className="wa-page">
        <div className="wa-card wa-empty small">
          <WaIcon.megaphone size={22} />
          {off ? 'Las campañas de WhatsApp no están activas en tu tienda.' : 'Las campañas las manejan los administradores de la tienda.'}
        </div>
      </div>
    )
  }

  return (
    <div className="wa-page">
      <nav className="wa-tabs" role="tablist" aria-label="Secciones de Campañas de Mkt">
        <button role="tab" aria-selected={tab === 'campanas'} className={`wa-tab ${tab === 'campanas' ? 'active' : ''}`} onClick={() => setTab('campanas')}>
          <WaIcon.megaphone /> Campañas
        </button>
        <button role="tab" aria-selected={tab === 'resultados'} className={`wa-tab ${tab === 'resultados' ? 'active' : ''}`} onClick={() => setTab('resultados')}>
          <WaIcon.chart /> Resultados
        </button>
      </nav>

      {tab === 'campanas' && <WhatsAppCampaigns preset={retry} onPresetApplied={() => setRetry(null)} onViewResults={() => setTab('resultados')} />}
      {tab === 'resultados' && (
        <WhatsAppCampaignResults
          onRetry={r => { setRetry(r); setTab('campanas') }}
          onOpenChat={phone => router.push(`/whatsapp?phone=${phone}`)}
        />
      )}
    </div>
  )
}
