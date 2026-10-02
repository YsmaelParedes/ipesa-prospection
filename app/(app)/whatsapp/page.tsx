'use client'

import { Suspense, useEffect, useState } from 'react'
import WhatsAppInbox from '@/components/WhatsAppInbox'
import { WhatsAppCampaigns, WhatsAppCampaignResults } from '@/components/WhatsAppCampaigns'
import { WaIcon } from '@/components/WhatsAppUI'
import { getUserRole } from '@/lib/profile'

type Tab = 'bandeja' | 'campanas' | 'resultados'

export default function WhatsAppPage() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [tab, setTab] = useState<Tab>('bandeja')

  useEffect(() => { getUserRole().then(r => setIsAdmin(r === 'admin')) }, [])

  return (
    <div className="wa-page">
      {isAdmin && (
        <nav className="wa-tabs" role="tablist" aria-label="Secciones de WhatsApp">
          {([
            ['bandeja', 'Bandeja', <WaIcon.chat key="i" />],
            ['campanas', 'Campañas', <WaIcon.megaphone key="i" />],
            ['resultados', 'Resultados', <WaIcon.chart key="i" />],
          ] as [Tab, string, React.ReactNode][]).map(([key, label, icon]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`wa-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
              {icon} {label}
            </button>
          ))}
        </nav>
      )}

      {tab === 'bandeja' && (
        // useSearchParams (chat abierto vía ?phone=) requiere un límite de Suspense
        <Suspense fallback={<div className="wa-card wa-empty"><span className="wa-spinner" /></div>}>
          <WhatsAppInbox isAdmin={isAdmin} />
        </Suspense>
      )}
      {tab === 'campanas' && isAdmin && <WhatsAppCampaigns />}
      {tab === 'resultados' && isAdmin && <WhatsAppCampaignResults />}
    </div>
  )
}
