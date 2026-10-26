import type { Metadata } from 'next'
import { NO_INDEX } from '@/lib/site'

export const metadata: Metadata = NO_INDEX

export default function BienvenidaLayout({ children }: { children: React.ReactNode }) {
  return children
}
