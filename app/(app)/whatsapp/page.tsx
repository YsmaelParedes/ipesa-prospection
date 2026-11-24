'use client'

import { Suspense } from 'react'
import WhatsAppInbox from '@/components/WhatsAppInbox'
import { WhatsAppOffer } from '@/components/WhatsAppOffer'
import { useSession } from '@/lib/profile'
import { InboxSkeleton } from '@/components/skeletons/WhatsAppSkeleton'

/** WhatsApp: la Bandeja con los chats. Las campañas están en «Campañas». */
export default function WhatsAppPage() {
  const session = useSession()
  const isAdmin = !!session?.isAdmin

  // Tienda sin WhatsApp: presentación del servicio ("Por activar")
  if (session?.store && !session.store.modules.whatsapp) {
    return <div className="wa-page"><WhatsAppOffer /></div>
  }

  return (
    <div className="wa-page">
      {/* useSearchParams (chat abierto vía ?phone=) requiere un límite de Suspense */}
      <Suspense fallback={<InboxSkeleton />}>
        <WhatsAppInbox isAdmin={isAdmin} />
      </Suspense>
    </div>
  )
}
