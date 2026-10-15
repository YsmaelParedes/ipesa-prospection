import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, invalidateMemberships, requirePlatformAdmin } from '@/lib/supabase-server'
import { rpcUserError } from '@/lib/platformEvents'
import { MAX_PAYMENT_MONTHS, PAYMENT_METHODS, isISODate, isMoney } from '@/lib/payments'
import { isUUID, jsonError, readJson, serverError } from '@/lib/validation'

const DAY = 24 * 60 * 60 * 1000

/**
 * POST /api/platform/stores/[id]/payments — registrar un pago recibido a mano.
 * { amount, months, method, paidOn: 'YYYY-MM-DD', invoiceRequested?, invoiceNumber?, notes? }
 * La base (record_store_payment) guarda el pago, extiende la vigencia y lo
 * anota en la bitácora en una sola transacción.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin()
  if (user instanceof Response) return user

  const { id } = await params
  if (!isUUID(id)) return jsonError('Tienda no encontrada', 404)
  const body = await readJson(req)
  if (!body) return jsonError('Cuerpo de solicitud inválido')

  const amount = typeof body.amount === 'string' && body.amount.trim() !== '' ? Number(body.amount) : body.amount
  if (!isMoney(amount)) return jsonError('Monto inválido (de 0 a 1,000,000, hasta 2 decimales)')
  const months = Number(body.months)
  if (!Number.isInteger(months) || months < 1 || months > MAX_PAYMENT_MONTHS) return jsonError(`Meses inválidos (de 1 a ${MAX_PAYMENT_MONTHS})`)
  if (!(PAYMENT_METHODS as readonly unknown[]).includes(body.method)) return jsonError('Método de pago inválido')
  if (!isISODate(body.paidOn)) return jsonError('Fecha del pago inválida')
  const paidAt = new Date(`${body.paidOn}T12:00:00Z`).getTime()
  if (paidAt > Date.now() + 2 * DAY || paidAt < Date.now() - 730 * DAY) return jsonError('La fecha del pago debe estar entre hace 2 años y hoy')
  const invoiceNumber = typeof body.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (invoiceNumber.length > 60) return jsonError('Número de factura muy largo (máximo 60)')
  if (notes.length > 500) return jsonError('Nota muy larga (máximo 500)')

  const { data, error } = await getServerSupabase().rpc('record_store_payment', {
    p_store: id, p_amount: amount, p_method: body.method, p_paid_on: body.paidOn, p_months: months,
    p_invoice_requested: body.invoiceRequested === true, p_invoice_number: invoiceNumber || null,
    p_notes: notes || null, p_actor: user.id,
  })
  const known = rpcUserError(error)
  if (known) return jsonError(known.message, known.status)
  if (error) return serverError('POST /api/platform/stores/[id]/payments', error, 'No se pudo registrar el pago')

  invalidateMemberships()  // el acceso de la tienda cambia (solo lectura → completo)
  return NextResponse.json({ payment: data }, { status: 201 })
}
