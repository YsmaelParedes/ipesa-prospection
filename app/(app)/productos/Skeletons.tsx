/**
 * Productos mientras carga: la lista (encabezado, buscador y renglones) y la
 * ficha, con las mismas clases que las pantallas.
 */
import { Loading, Sk, SkText, skRows, skWidth } from '@/components/Skeleton'
import s from './productos.module.css'

export function ProductRowsSkeleton({ rows = 8, check = false }: { rows?: number; check?: boolean }) {
  return (
    <Loading label="Cargando productos…" className={`${s.list} ${check ? '' : s.noCheck}`}>
      <div className={s.listHead}>
        {check && <span />}<span>Producto</span><span>Existencias</span><span>Categoría</span><span className={s.right}>Precio</span>
      </div>
      {skRows(rows, i => (
        <div key={i} className={s.row}>
          {check && <span className={s.check}><Sk w={16} h={16} r={4} /></span>}
          <span className={s.product}><b><SkText w={skWidth(i, 0.75)} /></b><small><SkText w={skWidth(i + 3, 0.3)} /></small></span>
          <span className={s.stockCell}><Sk w={64} h={20} r={4} /></span>
          <span className={s.category}><SkText w={skWidth(i + 1, 0.6)} /></span>
          <span className={s.price}><SkText w={64} /></span>
        </div>
      ))}
    </Loading>
  )
}

export function ProductsPageSkeleton() {
  return (
    <>
      <div className={s.head}>
        <h2>Productos</h2>
        <div className={s.headActions}><Sk w={140} h={36} r={8} /><Sk w={150} h={36} r={8} /></div>
      </div>
      <div className={s.controls}>
        <div className={s.search}><Sk w="100%" h={36} r={6} /></div>
        <Sk w={190} h={36} r={6} /><Sk w={190} h={36} r={6} /><Sk w={160} h={36} r={6} />
      </div>
      <ProductRowsSkeleton />
    </>
  )
}

export function ProductSkeleton() {
  return (
    <Loading label="Abriendo el producto…">
      <div className={s.fichaHead}>
        <span className={s.back}><Sk w={17} h={17} r={4} /></span>
        <h2>Producto</h2>
      </div>
      <div className={s.ficha}>
        <div className={`${s.card} ${s.top}`}>
          <div>
            <SkText w={120} />
            <div className={s.name}><SkText w="80%" /></div>
            <SkText w={220} />
            <div className={s.figures}>
              {['Precio', 'Costo', 'Existencias'].map(l => <div key={l} className={s.figure}><small>{l}</small><strong><SkText w={90} /></strong></div>)}
            </div>
          </div>
          <div className={s.details}>{skRows(5, i => <SkText key={i} w={skWidth(i, 0.9)} />)}</div>
        </div>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Listas de precios</h3>
          <div className={s.prices}>{skRows(4, i => <div key={i} className={s.priceRow}><span><SkText w={skWidth(i, 0.5)} /></span><span><SkText w={70} /></span><span><SkText w={40} /></span><span><SkText w={60} /></span></div>)}</div>
        </div>
      </div>
    </Loading>
  )
}
