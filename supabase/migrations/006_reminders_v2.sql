-- Tabla de recordatorios para seguimiento de leads
CREATE TABLE IF NOT EXISTS reminders (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id            UUID        REFERENCES leads(id) ON DELETE CASCADE,
  lead_name          TEXT        NOT NULL DEFAULT '',
  nota               TEXT        NOT NULL DEFAULT '',
  fecha_recordatorio TIMESTAMPTZ NOT NULL,
  completado         BOOLEAN     NOT NULL DEFAULT FALSE,
  completado_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_lead_id_idx            ON reminders(lead_id);
CREATE INDEX IF NOT EXISTS reminders_completado_idx         ON reminders(completado);
CREATE INDEX IF NOT EXISTS reminders_fecha_recordatorio_idx ON reminders(fecha_recordatorio);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_all" ON reminders
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
