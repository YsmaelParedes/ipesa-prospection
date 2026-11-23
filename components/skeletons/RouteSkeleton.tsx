/**
 * El skeleton de cada sección según la dirección. Lo usan la carga inicial de
 * la app (mientras se comprueba la sesión) y los loading.tsx de cada ruta, para
 * que siempre se vea la forma de la pantalla que va a aparecer.
 */
import { DashboardSkeleton } from './DashboardSkeleton'
import { ContactsPageSkeleton } from './ContactsSkeleton'
import { CampaignsPageSkeleton, WhatsAppPageSkeleton } from './WhatsAppSkeleton'
import { FormulasPageSkeleton } from './FormulasSkeleton'
import { ComercialPageSkeleton } from '@/app/(app)/comercial/Skeletons'
import { AgendaPageSkeleton } from '@/app/(app)/recordatorios/AgendaSkeleton'
import { SettingsPageSkeleton } from '@/app/(app)/configuracion/SettingsSkeleton'
import { QuoteEditorSkeleton, QuotesPageSkeleton } from '@/app/(app)/cotizaciones/Skeletons'
import { ProductSkeleton, ProductsPageSkeleton } from '@/app/(app)/productos/Skeletons'
import { ReportesPageSkeleton } from '@/app/(app)/reportes/Skeletons'

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const is = (base: string) => pathname === base || pathname.startsWith(`${base}/`)
  if (is('/contactos')) return <ContactsPageSkeleton />
  if (is('/comercial')) return <ComercialPageSkeleton />
  if (pathname.startsWith('/cotizaciones/')) return <QuoteEditorSkeleton />
  if (is('/cotizaciones')) return <QuotesPageSkeleton />
  if (pathname.startsWith('/productos/')) return <ProductSkeleton />
  if (is('/productos')) return <ProductsPageSkeleton />
  if (is('/reportes')) return <ReportesPageSkeleton />
  if (is('/recordatorios')) return <AgendaPageSkeleton />
  if (is('/whatsapp')) return <WhatsAppPageSkeleton />
  if (is('/campanas')) return <CampaignsPageSkeleton />
  if (is('/configuracion')) return <SettingsPageSkeleton />
  if (is('/formulas')) return <FormulasPageSkeleton />
  return <DashboardSkeleton />
}
