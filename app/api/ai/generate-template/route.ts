import { NextRequest } from 'next/server'
import OpenAI from 'openai'

const client = new OpenAI()

export async function POST(req: NextRequest) {
  const { channel, prompt } = await req.json()

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt es requerido' }, { status: 400 })
  }

  const isWA = channel === 'wa'

  const systemPrompt = isWA
    ? `Eres un experto en redacción de mensajes de WhatsApp para ventas y prospección comercial en México.
Genera únicamente el cuerpo del mensaje — sin títulos, sin explicaciones, sin comillas alrededor, sin introducción.
Puedes usar emojis, *negrita*, _cursiva_, saltos de línea y variables como {{1}} {{2}} para nombre, empresa, etc.
El mensaje debe ser profesional, conciso y efectivo.`
    : `Eres un experto en redacción de mensajes SMS para ventas y prospección comercial en México.
Genera únicamente el cuerpo del mensaje — sin títulos, sin explicaciones, sin comillas alrededor.
REGLAS ESTRICTAS:
- Máximo 160 caracteres en total
- PROHIBIDO usar acentos: escribe "informacion" no "información", "proxima" no "próxima", etc.
- PROHIBIDO usar ñ: escribe "numero" no "número"
- PROHIBIDO usar ¡ ¿
- Sin emojis, sin formato especial, solo texto plano`

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
