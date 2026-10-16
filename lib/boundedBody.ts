/** Lee un cuerpo sin superar la cota, incluso sin Content-Length o con tamaño falso. */
export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    const result = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
    return result
  } catch {
    await reader.cancel().catch(() => {})
    return null
  } finally {
    reader.releaseLock()
  }
}
