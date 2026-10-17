'use client'

import Link from 'next/link'
import { useEffect, useRef, type ComponentProps } from 'react'
import { prefetchRoute } from '@/lib/apiClient'

export default function CachedLink({ onMouseEnter, onMouseLeave, onFocus, ...props }: ComponentProps<typeof Link>) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => { clearTimeout(timer.current) }
  useEffect(() => cancel, [])
  const warm = () => { if (typeof props.href === 'string') void prefetchRoute(props.href).catch(() => {}) }
  return <Link {...props}
    onMouseEnter={e => { onMouseEnter?.(e); cancel(); timer.current = setTimeout(warm, 120) }}
    onMouseLeave={e => { onMouseLeave?.(e); cancel() }}
    onFocus={e => { onFocus?.(e); cancel(); warm() }} />
}
