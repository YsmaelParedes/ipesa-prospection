-- Tabla de logs de mensajes WhatsApp enviados via Twilio
CREATE TABLE IF NOT EXISTS message_logs (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  message_sid    TEXT        UNIQUE NOT NULL,
  contact_id     UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name   TEXT        NOT NULL DEFAULT '',
  contact_phone  TEXT        NOT NULL DEFAULT '',
  template_sid   TEXT        NOT NULL DEFAULT '',
  template_name  TEXT        NOT NULL DEFAULT '',
  status         TEXT        NOT NULL DEFAULT 'queued',
  error_code     TEXT,
  error_message  TEXT,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at   TIMESTAMPTZ,
  read_at        TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for  TIMESTAMPTZ
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS message_logs_contact_id_idx ON message_logs(contact_id);
CREATE INDEX IF NOT EXISTS message_logs_status_idx     ON message_logs(status);
CREATE INDEX IF NOT EXISTS message_logs_sent_at_idx    ON message_logs(sent_at DESC);

-- RLS: acceso total desde anon (la app controla acceso vía auth middleware propio)
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "message_logs_all" ON message_logs;
CREATE POLICY "message_logs_all" ON message_logs
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
