import { APP_NAME, BRAND_MARK } from '@/lib/brand'

/** Logo del producto: gota + nombre. El tamaño sale del font-size (del contenedor o de `className`). */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={className ? `brand-wordmark ${className}` : 'brand-wordmark'}>
      <img src={BRAND_MARK} alt="" width={64} height={64} />
      <span>{APP_NAME}</span>
    </span>
  )
}
