import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AdminShell from '@/components/AdminShell'
import { APP_NAME } from '@/lib/brand'
import { getSessionUser, isPlatformAdmin } from '@/lib/supabase-server'

export const metadata: Metadata = { title: `Panel del dueño · ${APP_NAME}` }

/**
 * Panel del dueño de la plataforma, separado del CRM de las tiendas.
 * Sin sesión, proxy.ts manda a /login. Con sesión pero sin ser
 * administrador de la plataforma: 404, para que una tienda ni sepa que existe.
 * Los datos los vuelve a proteger cada ruta de /api/platform.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user || !(await isPlatformAdmin(user.id))) notFound()
  return <AdminShell>{children}</AdminShell>
}
