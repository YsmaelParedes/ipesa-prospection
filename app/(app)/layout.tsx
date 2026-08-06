import AppShell from '@/components/AppShell'

/**
 * Auth protection is handled by middleware.ts (getSession — no network call).
 * This layout just wraps authenticated pages with the app shell.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
