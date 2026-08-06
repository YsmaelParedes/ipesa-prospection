/**
 * Shown by Next.js while the page server component is rendering.
 * Prevents the "Rendering…" browser-tab state from being visible to the user.
 */
export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      color: 'var(--muted, #888)',
      fontSize: 14,
      gap: 10,
    }}>
      <span style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: '2.5px solid var(--ipesa-orange, #EE5A24)',
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'spin 0.7s linear infinite',
      }} />
      Cargando…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
