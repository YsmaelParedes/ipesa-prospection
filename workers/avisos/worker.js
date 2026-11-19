// ── Matices — reloj de los avisos a la hora ──────────────────────────────
// Worker de Cloudflare con un Cron Trigger cada minuto. Primero pregunta a
// Supabase si ya toca algún recordatorio (public.reminders_due) y solo
// entonces llama a la app, que manda los avisos push.
//
// Por qué preguntar primero: casi nunca hay nada que avisar, y despertar a la
// app cada minuto (≈43,000 veces al mes) gastaba la CPU de Vercel para nada.
// La pregunta es una lectura sobre un índice; la app solo corre cuando sí hay
// algo. Ante cualquier error al preguntar, llama a la app como antes: un aviso
// no se pierde por esto.
//
// Vive fuera de Supabase a propósito: un pg_cron por minuto escribía en
// cron.job_run_details en cada vuelta y agotaba el Disk IO del plan.
//
//   CRON_KEY      (secreto) llave de 64 caracteres hex; la base guarda solo su
//                 SHA-256 en public.cron_keys (name = 'cloudflare-avisos').
//   TARGET_URL    (variable) https://www.matices.app/api/cron/reminders
//   SUPABASE_URL  (variable) https://<proyecto>.supabase.co
//   SUPABASE_KEY  (variable) llave publicable (sb_publishable_…): es pública,
//                 la misma que va en la app; sola no basta, hace falta CRON_KEY.
//
// Si cambia el dominio de la app, actualiza TARGET_URL.

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env))
  },
}

async function tick(env) {
  if (!(await somethingDue(env))) return
  const res = await fetch(env.TARGET_URL, {
    headers: { Authorization: `Bearer ${env.CRON_KEY}`, 'User-Agent': 'matices-avisos' },
    signal: AbortSignal.timeout(55_000),
  })
  // Un error queda en los registros del Cron Trigger en Cloudflare
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

/** ¿Ya toca algún recordatorio? Ante la duda (sin configurar o con error), sí. */
async function somethingDue(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_KEY) return true
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/reminders_due`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json', 'User-Agent': 'matices-avisos' },
      body: JSON.stringify({ p_key: env.CRON_KEY }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error(`reminders_due HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return true
    }
    return (await res.json()) !== false
  } catch (err) {
    console.error('reminders_due', err)
    return true
  }
}
