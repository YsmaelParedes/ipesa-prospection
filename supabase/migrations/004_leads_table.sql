-- Tabla de leads (pipeline de ventas)
CREATE TABLE IF NOT EXISTS leads (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL DEFAULT '',
  phone       TEXT        NOT NULL DEFAULT '',
  email       TEXT        NOT NULL DEFAULT '',
  canal       TEXT        NOT NULL DEFAULT 'Otro',
  segmento    TEXT        NOT NULL DEFAULT 'Residencial',
  estado      TEXT        NOT NULL DEFAULT 'Nuevo',
  monto       NUMERIC(12,2),
  notas       TEXT,
  contact_id  UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  fecha       DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_estado_idx      ON leads(estado);
CREATE INDEX IF NOT EXISTS leads_canal_idx       ON leads(canal);
CREATE INDEX IF NOT EXISTS leads_segmento_idx    ON leads(segmento);
CREATE INDEX IF NOT EXISTS leads_contact_id_idx  ON leads(contact_id);
CREATE INDEX IF NOT EXISTS leads_created_at_idx  ON leads(created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all" ON leads;
CREATE POLICY "leads_all" ON leads
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
