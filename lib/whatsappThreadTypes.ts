/**
 * Lo que mandan las rutas de la bandeja de WhatsApp y lee la pantalla
 * (components/WhatsAppInbox.tsx). Las rutas arman sus respuestas con estos
 * tipos, así que un campo que cambie en el servidor lo detecta el compilador
 * en la pantalla. Solo tipos: se puede importar desde el navegador.
 */
import type { NoWhatsApp } from './campaignKinds'
import type { ContactSummary } from './whatsappInbox'

/** Un chat en la lista (GET /api/whatsapp/conversations). */
export type ConversationSummary = {
  phone: string
  contactId: string | null
  name: string | null
  profileName: string | null
  segment: string | null
  optOut: boolean
  lastBody: string | null
  lastDirection: 'inbound' | 'outbound'
  lastStatus: string
  lastMediaType: string | null
  lastTemplate: string | null
  lastAt: string
  unread: number
  lastInboundAt: string | null
  windowOpen: boolean
  /** Meta reportó que el número no tiene WhatsApp (puede ser un fijo): ya no se le envían campañas. */
  noWhatsApp?: boolean
}

/** Un mensaje del historial (columnas OUTBOX_MESSAGE_FIELDS de lib/whatsappOutbox.ts). */
export type ThreadMessage = {
  id: string
  phone: string
  direction: 'inbound' | 'outbound'
  body: string | null
  status: string
  error_message: string | null
  template_name: string | null
  media_id: string | null
  media_type: string | null
  media_mime: string | null
  profile_name?: string | null
  contact_id?: string | null
  /** null en un saliente = lo contestó el agente de IA de Meta (ver whatsappWebhook). */
  user_id?: string | null
  /** 'phone': lo mandó la tienda desde su celular · 'history': traído de WhatsApp Business */
  origin?: 'phone' | 'history' | null
  created_at: string
}

export type ThreadContact = ContactSummary

/** Su estado en el sistema comercial; el detalle solo para su responsable o un administrador. */
export type ThreadCommercial = { status: string; next_action: string | null; next_action_at: string | null; last_note: string | null; mine: boolean }

/** Un chat abierto (GET /api/whatsapp/conversations/[phone]). */
export type ThreadPayload = {
  phone: string
  messages: ThreadMessage[]
  contact: ThreadContact | null
  commercial: ThreadCommercial | null
  profileName: string | null
  lastInboundAt: string | null
  windowOpen: boolean
  windowClosesAt: number | null
  noWhatsApp: NoWhatsApp | null
  markedRead: number
}
