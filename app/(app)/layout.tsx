import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import { NO_INDEX } from '@/lib/site'

export const metadata: Metadata = NO_INDEX

/**
 * La redirección a /login la hace proxy.ts (getSession, sin llamada de red);
 * los datos los protege cada ruta de /api. Este layout solo monta el shell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
