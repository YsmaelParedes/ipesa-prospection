import type { QueryPolicy } from './queryCache'

export function queryPolicy(path: string): QueryPolicy | null {
  const p = path.split('?')[0]
  const normal = { staleTime: 30_000, maxAge: 600_000 }
  if (p === '/api/data/export' || p.includes('/media/')) return null
  if (p === '/api/data/reminders') return { ...normal, poll: 60_000 }
  if (p.startsWith('/api/data/config') || p.startsWith('/api/formulas') || ['/api/whatsapp/templates', '/api/whatsapp/template-image'].includes(p) || p.startsWith('/api/whatsapp/quick-replies')) return { ...normal, staleTime: 300_000 }
  if (p.startsWith('/api/billing/')) return { staleTime: 15_000, maxAge: 60_000 }
  if (p === '/api/whatsapp/status' || p === '/api/store/whatsapp') return { ...normal, staleTime: 60_000 }
  if (p.startsWith('/api/whatsapp/campaigns/') || p === '/api/data/dashboard/whatsapp') return { staleTime: 15_000, maxAge: 60_000 }
  if (p === '/api/whatsapp/unread') return { ...normal, staleTime: 30_000, poll: 30_000 }
  if (p === '/api/whatsapp/conversations') return { ...normal, staleTime: 15_000, poll: 15_000 }
  // Threads can mark messages read. Only explicit preview requests may use the cache.
  if (p.startsWith('/api/whatsapp/conversations/')) return new URL(path, 'https://local').searchParams.get('preview') === '1' ? { ...normal, staleTime: 6_000 } : null
  if (p.startsWith('/api/data/') || p === '/api/store' || p.startsWith('/api/store/') || p === '/api/stores') return normal
  return null
}

export function mutationResources(path: string): string[] {
  if (path.startsWith('/api/data/contacts')) return ['/api/data/contacts', '/api/data/commercial', '/api/data/dashboard', '/api/whatsapp/']
  if (path.startsWith('/api/data/commercial')) return ['/api/data/commercial', '/api/data/contacts', '/api/data/dashboard']
  if (path.startsWith('/api/data/reminders')) return ['/api/data/reminders', '/api/data/dashboard']
  if (path.startsWith('/api/data/config')) return ['/api/data/config']
  if (path.startsWith('/api/whatsapp/')) return ['/api/whatsapp/', '/api/data/dashboard', '/api/data/contacts', '/api/data/commercial']
  if (path.startsWith('/api/store') || path === '/api/me') return ['/api/']
  return []
}

export function normalizedPath(input: string) {
  const url = new URL(input, 'https://local')
  url.searchParams.sort()
  return url.pathname + url.search
}
