// ── Matices — reloj de los avisos a la hora ──────────────────────────────
// Worker de Cloudflare con un Cron Trigger cada minuto. Solo llama a la app;
// ella decide si ya toca algún recordatorio y manda los avisos push.
//
// Vive fuera de Supabase a propósito: un pg_cron por minuto escribía en
// cron.job_run_details en cada vuelta y agotaba el Disk IO del plan.
//
//   CRON_KEY   (secreto) llave de 64 caracteres hex; la base guarda solo su
//              SHA-256 en public.cron_keys (name = 'cloudflare-avisos').
//   TARGET_URL (variable) https://www.matices.app/api/cron/reminders
//
// Si cambia el dominio de la app, actualiza TARGET_URL.

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env))
  },
}

async function tick(env) {
  const res = await fetch(env.TARGET_URL, {
    headers: { Authorization: `Bearer ${env.CRON_KEY}`, 'User-Agent': 'matices-avisos' },
    signal: AbortSignal.timeout(55_000),
  })
  // Un error queda en los registros del Cron Trigger en Cloudflare
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
}
