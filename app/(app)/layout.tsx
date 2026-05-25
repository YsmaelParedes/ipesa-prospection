import { redirect } from 'next/navigation'
import { getAuthClient } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getAuthClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <AppShell>{children}</AppShell>
}
