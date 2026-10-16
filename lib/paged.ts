/**
 * Lee todas las páginas de una consulta de Supabase: PostgREST devuelve como
 * máximo ~1000 filas por petición, así que una tienda con más contactos o
 * leads se quedaría corta sin esto. La consulta debe tener un orden estable
 * (p. ej. created_at + id) para que las páginas no se repitan ni salten filas.
 */
export async function fetchPaged<T>(
  query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  maxRows = 20000, pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) break
  }
  return out
}
