'use client'

interface Props {
  stage: string
  channel: string
  contact: any
}

const templates: Record<string, Record<string, string>> = {
  confirmacion: {
    whatsapp: `Hola {{nombre}}, te envié la propuesta de {{empresa}}. ¿Pudiste revisarla? Cualquier duda, me avisa. 👋`,
    email: `Hola {{nombre}},\n\nConfirmo que te envié la propuesta. ¿La recibiste sin problemas?\n\nSaludos,\nIPESA`,
    call: `Llamada para confirmar que recibió la propuesta y si tiene dudas inmediatas.`,
  },
  validacion: {
    whatsapp: `{{nombre}}, ¿qué te pareció la propuesta? ¿Hay algo que quieras ajustar? 🤔`,
    call: `Llamada para validar la propuesta y detectar dudas u objeciones.`,
    email: `Hola {{nombre}},\n\n¿Pudiste revisar la propuesta? Me gustaría saber tu opinión.\n\nSaludos,\nIPESA`,
  },
  valor: {
    whatsapp: `{{nombre}}, mira los beneficios de nuestra opción: 📌\n\n✅ Calidad premium\n✅ Mejor precio del mercado\n✅ Garantía 2 años`,
    email: `Hola {{nombre}},\n\nQuería compartirte los beneficios de nuestra solución:\n\n• Calidad premium\n• Garantía extendida\n• Promoción especial esta semana\n\nSaludos,\nIPESA`,
    call: `Llamada para reforzar el valor de la propuesta y compartir casos de éxito.`,
  },
  empuje: {
    whatsapp: `{{nombre}}, ¿cómo vas con la decisión? Te puedo ayudar en algo para avanzar. 💪`,
    call: `Llamada para empujar la decisión y resolver cualquier bloqueo.`,
    email: `Hola {{nombre}},\n\n¿En qué punto está la decisión? Estoy disponible para ayudarte a avanzar.\n\nSaludos,\nIPESA`,
  },
  recordatorio: {
    whatsapp: `{{nombre}}, solo quería darte seguimiento con información adicional que te puede ayudar. 📊`,
    email: `Hola {{nombre}},\n\nTe comparto información adicional que puede ser útil para tu decisión.\n\nSaludos,\nIPESA`,
    call: `Llamada de recordatorio para mantener presencia y compartir información adicional.`,
  },
  cierre: {
    whatsapp: `{{nombre}}, ¿te gustaría avanzar o prefieres que lo dejemos por ahora? Así sabemos qué hacer. 🎯`,
    call: `Llamada final para cerrar la venta o entender el motivo de no avanzar.`,
    email: `Hola {{nombre}},\n\nQuiero saber si podemos avanzar o si hay algo que no encaja con tus necesidades.\n\nSaludos,\nIPESA`,
  },
}

function replaceVars(text: string, contact: any) {
  return text
    .replace(/{{nombre}}/g, contact?.name || 'Cliente')
    .replace(/{{empresa}}/g, contact?.company || 'su empresa')
    .replace(/{{telefono}}/g, contact?.phone || '')
}

export default function FollowUpTemplateSelector({ stage, channel, contact }: Props) {
  const template = templates[stage]?.[channel]
  if (!template) return null

  return (
    <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
      <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Mensaje sugerido</p>
      <p className="text-gray-800 text-sm whitespace-pre-line leading-relaxed">
        {replaceVars(template, contact)}
      </p>
    </div>
  )
}
