-- ── Tabla para suscripciones de notificaciones push (Web Push API) ────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint   text UNIQUE NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_subs_all" ON push_subscriptions;
CREATE POLICY "push_subs_all" ON push_subscriptions
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
