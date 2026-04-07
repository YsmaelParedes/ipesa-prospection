import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

const APP_SECRET = process.env.APP_SECRET

/**
 * Verify session cookie from request.
 * Returns true if the session is valid.
 */
export function verifySession(req: NextRequest): boolean {
  if (!APP_SECRET) return false

  const cookie = req.cookies.get('session')?.value
  if (!cookie) return false

  const parts = cookie.split('.')
  if (parts.length !== 2) return false

  const [token, signature] = parts
  const expected = createHmac('sha256', APP_SECRET).update(token).digest('hex')

  return signature === expected
}

/**
 * Validate Twilio webhook signature.
 * Uses X-Twilio-Signature header to verify the request came from Twilio.
 */
export function verifyTwilioSignature(req: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return false

  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/webhook`
    : req.url

  // Parse the body params and sort them alphabetically
  const params = new URLSearchParams(body)
  const sortedParams: [string, string][] = []
  params.forEach((value, key) => {
    sortedParams.push([key, value])
  })
  sortedParams.sort(([a], [b]) => a.localeCompare(b))

  // Build the data string: URL + sorted key/value pairs
  let data = url
  for (const [key, value] of sortedParams) {
    data += key + value
  }

  const computed = createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64')

  return computed === signature
}
