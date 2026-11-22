import { NextRequest, NextResponse } from 'next/server'
import { requireStore } from '@/lib/supabase-server'
import { jsonError, readJson, serverError } from '@/lib/validation'
import { DAY, limitShared, tooMany } from '@/lib/rateLimit'
import { effectivePlan } from '@/lib/stores'
import { quoteFileMime, quoteFileProblem } from '@/lib/quoteFiles'
import { quoteUploadUrl } from '@/lib/quoteFilesServer'

/** Archivos de cotizaciones por tienda al día: Litro (gratis) menos, los planes de pago más. */
const UPLOADS_PER_DAY = { litro: 30, paid: 300 }

/**
 * POST /api/data/quotes/files — { name, type, size }: dirección para subir el
 * archivo de una cotización directo al almacenamiento. Después se crea la
 * cotización con /api/data/quotes/upload (o al registrar en Comercial).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireStore({ write: true })
  if (ctx instanceof Response) return ctx
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')
  const file = { name: String(body.name ?? ''), type: String(body.type ?? ''), size: Number(body.size) }
  const problem = Number.isFinite(file.size) ? quoteFileProblem(file) : 'Archivo inválido'
  const mime = quoteFileMime(file.name, file.type)
  if (problem || !mime) return jsonError(problem ?? 'Archivo inválido')

  const perDay = effectivePlan(ctx.store) === 'litro' ? UPLOADS_PER_DAY.litro : UPLOADS_PER_DAY.paid
  if (!(await limitShared([{ key: `quote-upload:${ctx.storeId}`, max: perDay, windowMs: DAY }]))) {
    return tooMany(`Tu tienda llegó al máximo de ${perDay} archivos de cotizaciones por día. Intenta mañana.`, 3600)
  }
  try {
    return NextResponse.json(await quoteUploadUrl(ctx.storeId, mime))
  } catch (error) {
    return serverError('POST /api/data/quotes/files', error, 'No se pudo preparar la subida del archivo')
  }
}
