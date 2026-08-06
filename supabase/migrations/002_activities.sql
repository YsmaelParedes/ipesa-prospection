-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002: Historial de actividades + mejoras en recordatorios
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Seguro de ejecutar múltiples veces (usa IF NOT EXISTS)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla lead_activities ─────────────────────────────────────────────────
-- Registra cada interacción con el cliente: llamadas, correos, cotizaciones, etc.
CREATE TABLE IF NOT EXISTS lead_activities (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       uuid        REFERENCES leads(id) ON DELETE CASCADE,
  user_id       uuid,
  type          text        NOT NULL DEFAULT 'note',
  -- tipos: call | email | whatsapp | quote | note | meeting | visit
  description   text,
  amount        numeric,      -- solo para type = 'quote'
  activity_date timestamptz   DEFAULT now(),
  created_at    timestamptz   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_user_id  ON lead_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_date     ON lead_activities(activity_date DESC);

-- ── 2. Campos adicionales en reminders ───────────────────────────────────────
-- type:     tipo de tarea (task | call | email | whatsapp | meeting)
-- priority: nivel de urgencia (low | medium | high)
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS type     text DEFAULT 'task';
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';

-- ── Verificación ──────────────────────────────────────────────────────────────
-- SELECT id, type, description, amount, activity_date FROM lead_activities LIMIT 5;
-- SELECT id, type, priority, reminder_date FROM reminders LIMIT 5;
