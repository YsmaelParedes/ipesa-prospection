/* Iconos de la app: todos salen de librerías (Lucide para la interfaz, Simple Icons para logos de marcas).
   Aquí solo van los que se comparten entre pantallas o dependen de datos (tipos de recordatorio, resultados, archivos). */
import { forwardRef, type ComponentProps } from 'react'
import { SiWhatsapp } from '@icons-pack/react-simple-icons'
import {
  ClipboardList, Phone, Mail, Handshake, MessageCircle, Image, Mic, Video, FileText, Sticker,
  type LucideIcon, type LucideProps,
} from 'lucide-react'

export type { LucideIcon, LucideProps }

/** Logo de WhatsApp (Simple Icons). Sin título propio: el texto de al lado ya dice qué es. */
export const WhatsAppIcon = forwardRef<SVGSVGElement, Omit<ComponentProps<typeof SiWhatsapp>, 'ref'>>(
  function WhatsAppIcon({ title = '', ...p }, ref) {
    return <SiWhatsapp ref={ref} title={title} aria-hidden={title ? undefined : true} {...p} />
  },
)

/** Icono de cada tipo de recordatorio (mismas claves que REM_TYPES en lib/crm). */
export const REMINDER_TYPE_ICONS: Record<string, LucideIcon> = {
  task: ClipboardList,
  call: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  meeting: Handshake,
}

/** Icono de cada tipo de archivo de WhatsApp. */
export const MEDIA_TYPE_ICONS: Record<string, LucideIcon> = {
  image: Image,
  audio: Mic,
  video: Video,
  document: FileText,
  sticker: Sticker,
}
