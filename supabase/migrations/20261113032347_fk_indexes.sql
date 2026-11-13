-- Índices para las llaves foráneas que el revisor de rendimiento de Supabase marcó sin índice.
-- Evitan recorrer la tabla completa al borrar o cambiar un usuario.
create index if not exists commercial_activities_user_fk_idx on public.commercial_activities (user_id);
create index if not exists commercial_daily_notes_user_fk_idx on public.commercial_daily_notes (user_id);
create index if not exists project_quotes_created_by_fk_idx on public.project_quotes (created_by);
