import { redirect } from 'next/navigation'

/* El agente de IA llega junto con WhatsApp: mientras tanto se anuncian en una sola página. */
export default function AgenteIaPage() {
  redirect('/inicio/whatsapp')
}
