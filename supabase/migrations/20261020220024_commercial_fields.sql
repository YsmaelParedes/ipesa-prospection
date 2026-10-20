-- ════════════════════════════════════════════════════════════════════════════
-- Sistema comercial: datos del Excel que faltaban (docs/SISTEMA_COMERCIAL.md)
--
--   · contacts.priority: alta, media o baja (ordena la cola y filtra la base).
--   · contacts.potential_monthly: compra mensual estimada del prospecto
--     (tablero de Seguimiento y "En juego").
--   · contacts.origin: de dónde salió el prospecto (visita, llamada,
--     recomendación…), aparte del canal de adquisición.
--   · commercial_daily_notes: observaciones del día de cada persona (Control
--     diario). Una por persona y día.
--
-- Solo el servidor (service_role) las usa; anon y authenticated no tienen
-- ningún permiso, igual que el resto de las tablas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts
  add column priority          text not null default 'media' check (priority in ('alta', 'media', 'baja')),
  add column potential_monthly numeric(12,2) check (potential_monthly >= 0),
  add column origin            text check (char_length(origin) <= 60);

create table public.commercial_daily_notes (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  note       text not null check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id, day)
);
create index commercial_daily_notes_day_idx on public.commercial_daily_notes (store_id, day);

alter table public.commercial_daily_notes enable row level security;
revoke all on public.commercial_daily_notes from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_daily_notes to service_role;
