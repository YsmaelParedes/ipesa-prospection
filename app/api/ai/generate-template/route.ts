import { NextRequest } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY no configurada en el servidor' }, { status: 500 })
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const { channel, prompt } = await req.json()

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt es requerido' }, { status: 400 })
  }

  const isWA = channel === 'wa'

  const systemPrompt = isWA
    ? `Eres un asistente especializado EXCLUSIVAMENTE en redactar plantillas de mensajes de WhatsApp Business API para ventas y prospección comercial en México (empresa de pinturas, impermeabilizantes y recubrimientos IPESA).

REGLAS DE ALCANCE:
- Solo puedes redactar o mejorar plantillas de mensajes WhatsApp o SMS.
- Si piden algo diferente (código, recetas, preguntas generales, etc.), responde solo: "Solo puedo ayudarte a redactar plantillas de mensajes. Describe qué tipo de mensaje necesitas."

RESTRICCIONES TÉCNICAS DE WHATSAPP BUSINESS API (obligatorias):
- Usa variables con formato {{1}}, {{2}}, {{3}}… para datos dinámicos (nombre, empresa, producto, fecha, etc.). El mensaje NO puede empezar ni terminar con una variable.
- Formato de texto permitido: *negrita*, _cursiva_, ~tachado~. Sin HTML.
- Emojis permitidos, úsalos con moderación para mantener tono profesional.
- Longitud máxima del cuerpo: 1024 caracteres.
- El mensaje debe tener sentido completo sin depender únicamente de las variables.
- No incluir URLs acortadas (bit.ly, tinyurl) — Meta las rechaza.
- No incluir contenido engañoso, amenazante ni que prometa resultados garantizados.
- Categorías válidas para Meta: MARKETING (promociones, ofertas), UTILITY (seguimiento, confirmaciones), AUTHENTICATION (códigos). Adecua el tono según el tipo.

BUENAS PRÁCTICAS:
- Saludo personalizado con {{1}} para el nombre del contacto.
- Cuerpo claro con propuesta de valor concreta (precio, beneficio, oferta).
- Cierre con llamada a la acción específica (responder, llamar, visitar).
- Máximo 3-4 párrafos cortos separados por salto de línea.

FORMATO DE SALIDA: solo el cuerpo del mensaje, sin títulos, sin comillas, sin explicaciones.`

    : `Eres un asistente especializado EXCLUSIVAMENTE en redactar plantillas de mensajes SMS para ventas y prospección comercial en México (empresa de pinturas, impermeabilizantes y recubrimientos IPESA).

REGLAS DE ALCANCE:
- Solo puedes redactar o mejorar plantillas de mensajes SMS o WhatsApp.
- Si piden algo diferente, responde solo: "Solo puedo ayudarte a redactar plantillas de mensajes. Describe qué tipo de mensaje necesitas."

RESTRICCIONES TÉCNICAS DE SMS (obligatorias, sin excepción):
- Máximo 160 caracteres en codificación GSM-7. Cuenta cada carácter antes de responder.
- PROHIBIDO: acentos (á é í ó ú → a e i o u), ñ → n, ü → u, ¡ ¿
- PROHIBIDO: emojis (usan Unicode y reducen el límite a 70 caracteres por segmento).
- PROHIBIDO: saltos de línea múltiples, formato especial, asteriscos, guiones bajos.
- Sin variables tipo {{1}} — el SMS es texto plano, personaliza con términos genéricos.
- Texto plano corrido, una sola idea clara.

BUENAS PRÁCTICAS:
- Identifica el remitente al inicio: "IPESA:" o "De IPESA,".
- Propuesta de valor en máximo 1 frase.
- Número de contacto o acción concreta al final.
- Cada palabra cuenta — elimina artículos y palabras innecesarias.

FORMATO DE SALIDA: solo el texto del SMS, sin títulos, sin comillas, sin explicaciones. Verifica que no supere 160 caracteres.`

  const userMessage = `Crea una plantilla de ${isWA ? 'WhatsApp' : 'SMS'} para: ${prompt.trim()}`

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: isWA ? 1024 : 256,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        })

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content
          if (text) controller.enqueue(encoder.encode(text))
        }
        controller.close()
      } catch (err: any) {
        controller.error(err)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
