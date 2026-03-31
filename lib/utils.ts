export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function interpolateTemplate(content: string, contact: Record<string, string>) {
  return content.replace(/{{(\w+)}}/g, (_, key) => contact[key] || `{{${key}}}`)
}
