'use client'

import { useEffect } from 'react'
import Script from 'next/script'
import { SITE_URL } from '@/lib/site'
import { UMAMI_SCRIPT_PATH, UMAMI_WEBSITE_ID, flushPendingEvents, track, type EventName } from '@/lib/analytics'

/**
 * Carga Umami en todas las páginas (ver lib/analytics.ts). Las visitas solo se
 * registran en páginas públicas; dentro del CRM solo salen los eventos que el
 * código pide con track(). Sin NEXT_PUBLIC_UMAMI_WEBSITE_ID no hace nada.
 */

/** Páginas públicas (además de la portada "/", que también es el Inicio del CRM). */
const PUBLIC_PAGE = /^\/(?:inicio(?:\/.*)?|registro|privacidad|terminos)\/?$/
/** Solo se conservan los parámetros de campaña: nada de búsquedas ni datos de la app. */
const CAMPAIGN_PARAM = /^utm_(?:source|medium|campaign|term|content)$/
const BEFORE_SEND = '__maticesUmamiBeforeSend'

type Payload = { url?: string; referrer?: string; name?: string; [key: string]: unknown }

function cleanUrl(raw: string, keepCampaign: boolean): string {
  const url = new URL(raw, window.location.origin)
  for (const key of [...url.searchParams.keys()]) {
    if (!keepCampaign || !CAMPAIGN_PARAM.test(key)) url.searchParams.delete(key)
  }
  url.hash = ''
  return url.origin === window.location.origin && raw.startsWith('/') ? url.pathname + url.search : url.toString()
}

/** "/" es la portada sin sesión y el Inicio del CRM con sesión: decide la página que se ve. */
function isPublicPage(pathname: string): boolean {
  if (pathname === '/') return !!document.querySelector('[data-public-site]')
  return PUBLIC_PAGE.test(pathname)
}

/** Umami la llama antes de cada envío; devolver null lo cancela. */
export function beforeSend(type: string, payload: Payload): Payload | null {
  try {
    if (type !== 'event' && type !== 'performance') return null
    const url = new URL(payload.url || window.location.href, window.location.origin)
    const isNamedEvent = type === 'event' && !!payload.name
    if (!isNamedEvent && !isPublicPage(url.pathname)) return null
    return {
      ...payload,
      url: cleanUrl(payload.url || window.location.href, true),
      ...(payload.referrer ? { referrer: cleanUrl(payload.referrer, false) } : {}),
    }
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)[BEFORE_SEND] = beforeSend
}

/** Clics en elementos con data-track (ver trackAttrs): sin frenar el enlace. */
function useClickTracking() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.('[data-track]')
      if (!el) return
      const data: Record<string, string> = {}
      for (const attr of el.getAttributeNames()) {
        const key = /^data-track-(.+)$/.exec(attr)?.[1]
        if (key) data[key] = el.getAttribute(attr) ?? ''
      }
      track(el.getAttribute('data-track') as EventName, data)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
}

export function Analytics() {
  useClickTracking()
  if (!UMAMI_WEBSITE_ID) return null
  return (
    <Script
      src={UMAMI_SCRIPT_PATH}
      strategy="afterInteractive"
      onLoad={flushPendingEvents}
      data-website-id={UMAMI_WEBSITE_ID}
      // Los envíos van al puente /api/send de matices.app (no a Umami directo)
      data-host-url={SITE_URL}
      // Solo cuenta en el dominio real: ni localhost ni las vistas previas de Vercel
      data-domains={new URL(SITE_URL).hostname}
      data-before-send={BEFORE_SEND}
      data-do-not-track="true"
      // Velocidad real de cada página (LCP, INP, CLS) para el reporte de rendimiento
      data-performance="true"
    />
  )
}
