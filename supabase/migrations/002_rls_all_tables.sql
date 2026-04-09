-- Habilita RLS en todas las tablas públicas de la app.
-- La app usa anon key con middleware de auth propio (HMAC), así que
-- las políticas permiten acceso completo a anon/authenticated.

-- contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contacts_all" ON contacts;
CREATE POLICY "contacts_all" ON contacts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "templates_all" ON templates;
CREATE POLICY "templates_all" ON templates
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- reminders
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminders_all" ON reminders;
CREATE POLICY "reminders_all" ON reminders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- segments
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "segments_all" ON segments;
CREATE POLICY "segments_all" ON segments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaigns_all" ON campaigns;
CREATE POLICY "campaigns_all" ON campaigns
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- contact_follow_ups
ALTER TABLE contact_follow_ups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_follow_ups_all" ON contact_follow_ups;
CREATE POLICY "contact_follow_ups_all" ON contact_follow_ups
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- follow_up_sequences
ALTER TABLE follow_up_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follow_up_sequences_all" ON follow_up_sequences;
CREATE POLICY "follow_up_sequences_all" ON follow_up_sequences
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- follow_up_stages
ALTER TABLE follow_up_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follow_up_stages_all" ON follow_up_stages;
CREATE POLICY "follow_up_stages_all" ON follow_up_stages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- contact_notes
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_notes_all" ON contact_notes;
CREATE POLICY "contact_notes_all" ON contact_notes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- contact_analytics (si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='contact_analytics') THEN
    EXECUTE 'ALTER TABLE contact_analytics ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "contact_analytics_all" ON contact_analytics';
    EXECUTE 'CREATE POLICY "contact_analytics_all" ON contact_analytics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
