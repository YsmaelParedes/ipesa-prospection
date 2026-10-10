/** Descarga de listas en CSV que Excel abre bien (acentos incluidos). Solo navegador. */

export function csvCell(value: string) {
  // Evita que Excel interprete texto del usuario como fórmula
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Fecha y hora local: 2026-10-07 14:05. */
export function csvStamp(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function downloadCsv(filename: string, head: string[], rows: string[][]) {
  // El BOM hace que Excel lo lea como UTF-8
  const csv = '﻿' + [head, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
