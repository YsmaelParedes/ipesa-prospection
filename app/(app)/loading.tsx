/**
 * Se muestra mientras carga el segmento de la página (navegación entre secciones).
 * La animación `spin` vive en globals.css.
 */
export default function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--muted)', fontSize: 14, gap: 10 }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', display: 'inline-block',
        border: '2.5px solid var(--brand)', borderTopColor: 'transparent',
        animation: 'spin 0.7s linear infinite',
      }} />
      Cargando…
    </div>
  )
}
