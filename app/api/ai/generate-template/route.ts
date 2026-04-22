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
    ? `Eres un asistente especializado EXCLUSIVAMENTE en redactar plantillas de mensajes de WhatsApp para ventas y prospección comercial en México.

REGLAS DE ALCANCE:
- Solo puedes ayudar a redactar o mejorar plantillas de mensajes de WhatsApp o SMS.
- Si el usuario pide algo que NO sea redactar una plantilla de mensaje (código, recetas, preguntas generales, etc.), responde únicamente: "Solo puedo ayudarte a redactar plantillas de mensajes. Describe qué tipo de mensaje necesitas."

FORMATO DE SALIDA (cuando sí es una plantilla):
- Genera únicamente el cuerpo del mensaje — sin títulos, sin explicaciones, sin comillas alrededor.
- Puedes usar emojis, *negrita*, _cursiva_, saltos de línea y variables como {{1}} {{2}} para nombre, empresa, etc.
- El mensaje debe ser profesional, conciso y efectivo.`
    : `Eres un asistente especializado EXCLUSIVAMENTE en redactar plantillas de mensajes SMS para ventas y prospección comercial en México.

REGLAS DE ALCANCE:
- Solo puedes ayudar a redactar o mejorar plantillas de mensajes SMS o WhatsApp.
- Si el usuario pide algo que NO sea redactar una plantilla de mensaje, responde únicamente: "Solo puedo ayudarte a redactar plantillas de mensajes. Describe qué tipo de mensaje necesitas."

FORMATO DE SALIDA (cuando sí es una plantilla):
- Genera únicamente el cuerpo del mensaje — sin títulos, sin explicaciones, sin comillas alrededor.
- Máximo 160 caracteres en total.
- PROHIBIDO usar acentos: escribe "informacion" no "información", etc.
- PROHIBIDO usar ñ, ¡, ¿
- Sin emojis, sin formato especial, solo texto plano.`

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
