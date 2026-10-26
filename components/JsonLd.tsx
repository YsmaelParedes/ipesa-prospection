/**
 * Datos estructurados para Google (schema.org en JSON-LD). Es texto dentro de
 * un <script>: el "<" se escapa para que ningún texto pueda cerrar la etiqueta.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
