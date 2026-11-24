import { SectionSkeleton } from '@/components/skeletons/SectionSkeleton'

/** Sistema Comercial mientras carga: la forma de la pantalla, en gris (ver ./Skeletons). */
export default function Loading() {
  return <SectionSkeleton path="/comercial" />
}
