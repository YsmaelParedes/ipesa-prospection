-- Limpieza de performance sugerida por el linter de Supabase (2026-09-26):
--  1. Índices duplicados (mismo efecto, uno de sobra en cada par).
--  2. Políticas RLS que reevaluaban auth.uid() por cada fila en vez de una
--     sola vez por query — mismo resultado, mejor plan de ejecución.
-- Ninguno de los dos cambia comportamiento ni datos.

DROP INDEX IF EXISTS public.idx_push_subscriptions_user_id;
DROP INDEX IF EXISTS public.idx_reminders_user_id;

ALTER POLICY "reminders_user_only" ON public.reminders
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "push_subs_user_only" ON public.push_subscriptions
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "leads_user_only" ON public.leads
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "lead_activities_user_only" ON public.lead_activities
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
