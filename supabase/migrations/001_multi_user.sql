-- ════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Multi-usuario IPESA CRM
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Seguro de ejecutar múltiples veces (usa IF NOT EXISTS / WHERE NULL)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. leads: agregar user_id ─────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);

-- ── 2. reminders: agregar user_id ─────────────────────────────────────────
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);

-- ── 3. push_subscriptions: agregar user_id ────────────────────────────────
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ── 4. Asignar registros existentes al usuario administrador ──────────────
-- Todos los registros sin user_id se asignan al primer usuario registrado
-- para que no "desaparezcan" después de activar el filtrado multi-usuario.
DO $$
DECLARE
  admin_id uuid;
BEGIN
  SELECT id INTO admin_id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF admin_id IS NOT NULL THEN
    UPDATE leads     SET user_id = admin_id WHERE user_id IS NULL;
    UPDATE reminders SET user_id = admin_id WHERE user_id IS NULL;
    RAISE NOTICE 'Registros existentes asignados al usuario admin: %', admin_id;
  ELSE
    RAISE NOTICE 'No se encontró ningún usuario en auth.users';
  END IF;
END $$;

-- ── Verificación (opcional, ejecutar después para confirmar) ───────────────
-- SELECT COUNT(*) AS leads_sin_usuario    FROM leads     WHERE user_id IS NULL;
-- SELECT COUNT(*) AS reminders_sin_usuario FROM reminders WHERE user_id IS NULL;
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at;
