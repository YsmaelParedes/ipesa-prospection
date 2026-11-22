/** Fechas para nombres de archivo y celdas de Excel (las descargas ya son .xlsx, ver lib/exportData). */

/** Fecha y hora local: 2026-10-07 14:05. */
export function csvStamp(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
