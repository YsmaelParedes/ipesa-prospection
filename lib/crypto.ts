/**
 * Cifrado de secretos de cada tienda (token y app secret de WhatsApp) con
 * AES-256-GCM. La llave vive solo en el servidor (CREDENTIALS_ENCRYPTION_KEY,
 * 32 bytes en base64: `openssl rand -base64 32`), así que un respaldo o una
 * fuga de la base no expone las credenciales. El id de la tienda va como
 * dato autenticado: un secreto copiado a otra tienda no se puede descifrar.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function encryptionKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY no está configurada')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('CREDENTIALS_ENCRYPTION_KEY debe ser de 32 bytes en base64')
  return key
}

export function hasEncryptionKey(): boolean {
  try { encryptionKey(); return true } catch { return false }
}

export function encryptSecret(plain: string, context: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decryptSecret(sealed: string, context: string): string {
  const [version, iv, tag, ct] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Secreto con formato desconocido')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
}

/** Token aleatorio para enlaces (invitaciones, webhooks). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** SHA-256 en hex: en la base solo se guarda el hash de los tokens de enlace. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
