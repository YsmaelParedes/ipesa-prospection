-- ── Tabla de configuración dinámica: segmentos y canales ──────────────────
CREATE TABLE IF NOT EXISTS app_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL CHECK (type IN ('segment', 'canal')),
  label      text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (type, label)
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_config" ON app_config;
CREATE POLICY "allow_all_config" ON app_config FOR ALL USING (true) WITH CHECK (true);

-- Valores por defecto
INSERT INTO app_config (type, label) VALUES
  ('segment', 'Constructor'),
  ('segment', 'Arquitecto'),
  ('segment', 'Hogar'),
  ('segment', 'Empresa'),
  ('canal', 'Referido'),
  ('canal', 'Visita a Tienda'),
  ('canal', 'WhatsApp'),
  ('canal', 'Redes Sociales'),
  ('canal', 'Campaña Pagada'),
  ('canal', 'Otro')
ON CONFLICT (type, label) DO NOTHING;

-- ── Parchar tabla reminders: agregar columnas faltantes una por una ────────
DO $$
BEGIN
  -- Crear tabla si no existe (esquema completo)
  CREATE TABLE IF NOT EXISTS reminders (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id            uuid        REFERENCES leads(id) ON DELETE CASCADE,
    lead_name          text        NOT NULL DEFAULT '',
    nota               text        NOT NULL DEFAULT '',
    fecha_recordatorio timestamptz NOT NULL,
    completado         boolean     NOT NULL DEFAULT false,
    completado_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now()
  );

  -- lead_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE reminders ADD COLUMN lead_id uuid REFERENCES leads(id) ON DELETE CASCADE;
  END IF;

  -- lead_name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'lead_name'
  ) THEN
    ALTER TABLE reminders ADD COLUMN lead_name text NOT NULL DEFAULT '';
  END IF;

  -- nota
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'nota'
  ) THEN
    ALTER TABLE reminders ADD COLUMN nota text NOT NULL DEFAULT '';
  END IF;

  -- completado
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'completado'
  ) THEN
    ALTER TABLE reminders ADD COLUMN completado boolean NOT NULL DEFAULT false;
  END IF;

  -- completado_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'completado_at'
  ) THEN
    ALTER TABLE reminders ADD COLUMN completado_at timestamptz;
  END IF;

  -- Quitar NOT NULL de lead_id por si acaso
  BEGIN
    ALTER TABLE reminders ALTER COLUMN lead_id DROP NOT NULL;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

-- Índices (solo si la columna existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'lead_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS reminders_lead_id_idx ON reminders(lead_id)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'completado'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS reminders_completado_idx ON reminders(completado)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reminders' AND column_name = 'fecha_recordatorio'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS reminders_fecha_recordatorio_idx ON reminders(fecha_recordatorio)';
  END IF;
END $$;

-- RLS
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_all" ON reminders
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
