'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { RouteSkeleton } from './RouteSkeleton'

/** loading.tsx de una sección con varias pantallas: la forma de la que se pidió (?tab=). */
export function SectionSkeleton({ path }: { path: string }) {
  return <Suspense fallback={<RouteSkeleton pathname={path} />}><Here path={path} /></Suspense>
}

function Here({ path }: { path: string }) {
  return <RouteSkeleton pathname={path} tab={useSearchParams().get('tab')} />
}
