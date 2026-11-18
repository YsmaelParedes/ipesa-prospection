/**
 * El skeleton de cada sección según la dirección. Lo usan la carga inicial de
 * la app (mientras se comprueba la sesión) y los loading.tsx de cada ruta, para
 * que siempre se vea la forma de la pantalla que va a aparecer.
 */
import { DashboardSkeleton } from './DashboardSkeleton'
import { ContactsPageSkeleton } from './ContactsSkeleton'
import { WhatsAppPageSkeleton } from './WhatsAppSkeleton'
import { FormulasPageSkeleton } from './FormulasSkeleton'
import { ComercialPageSkeleton } from '@/app/(app)/comercial/Skeletons'
import { AgendaPageSkeleton } from '@/app/(app)/recordatorios/AgendaSkeleton'
import { SettingsPageSkeleton } from '@/app/(app)/configuracion/SettingsSkeleton'

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const is = (base: string) => pathname === base || pathname.startsWith(`${base}/`)
  if (is('/contactos')) return <ContactsPageSkeleton />
  if (is('/comercial')) return <ComercialPageSkeleton />
  if (is('/recordatorios')) return <AgendaPageSkeleton />
  if (is('/whatsapp')) return <WhatsAppPageSkeleton />
  if (is('/configuracion')) return <SettingsPageSkeleton />
  if (is('/formulas')) return <FormulasPageSkeleton />
  return <DashboardSkeleton />
}
