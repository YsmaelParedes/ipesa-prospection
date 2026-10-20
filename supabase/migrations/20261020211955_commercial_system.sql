-- ════════════════════════════════════════════════════════════════════════════
-- Sistema comercial (reemplaza a Leads) — docs/SISTEMA_COMERCIAL.md
--
--   · contacts: responsable (owner_id), estado comercial, próxima acción y su
--     fecha, última actividad/resultado/nota, llamadas seguidas sin respuesta
--     y colonia. El responsable debe ser miembro de la tienda; si se quita del
--     equipo o se desactiva, sus contactos vuelven a "Sin asignar".
--   · commercial_activities: cada llamada, WhatsApp, visita o nota, con su
--     resultado, montos y la próxima acción que dejó.
--   · stores.commercial_goals: metas diarias por persona.
--   · log_commercial_activity: registra la actividad y actualiza el contacto
--     en la MISMA transacción, y solo si quien registra es el responsable.
--
-- Solo el servidor (service_role) las usa; anon y authenticated no tienen
-- ningún permiso, igual que el resto de las tablas.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts
  add column owner_id          uuid,
  add column commercial_status text not null default 'nuevo'
    check (commercial_status in ('nuevo', 'contactado', 'interes', 'cotizacion', 'cliente', 'no_interesado', 'depurar')),
  add column next_action       text check (char_length(next_action) <= 200),
  add column next_action_at    date,
  add column last_activity_at  timestamptz,
  add column last_result       text,
  add column last_note         text check (char_length(last_note) <= 2000),
  add column no_answer_streak  smallint not null default 0 check (no_answer_streak >= 0),
  add column colonia           text check (char_length(colonia) <= 120);

alter table public.contacts
  add constraint contacts_owner_member_fkey
  foreign key (store_id, owner_id) references public.store_members (store_id, user_id) on delete set null (owner_id);

create index contacts_store_owner_next_idx on public.contacts (store_id, owner_id, next_action_at);

alter table public.stores
  add column commercial_goals jsonb not null
    default '{"calls": 25, "effective": 12, "quotes": 5, "followups": 10, "sales": 2}'::jsonb;

create table public.commercial_activities (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  contact_id     uuid not null,
  user_id        uuid references auth.users(id) on delete set null,
  kind           text not null check (kind in ('llamada', 'whatsapp', 'visita', 'nota')),
  result         text check (result in ('no_contesta', 'contactado', 'interes', 'cotizacion', 'venta', 'reprogramar', 'no_interesado', 'numero_equivocado')),
  note           text check (char_length(note) <= 2000),
  quote_amount   numeric(12,2) check (quote_amount >= 0),
  sale_amount    numeric(12,2) check (sale_amount >= 0),
  next_action    text check (char_length(next_action) <= 200),
  next_action_at date,
  is_followup    boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint commercial_activities_needs_result check (kind = 'nota' or result is not null),
  constraint commercial_activities_contact_same_store_fkey
    foreign key (store_id, contact_id) references public.contacts (store_id, id) on delete cascade
);
create index commercial_activities_contact_idx on public.commercial_activities (store_id, contact_id, created_at desc);
create index commercial_activities_day_idx     on public.commercial_activities (store_id, created_at desc);
create index commercial_activities_user_idx    on public.commercial_activities (store_id, user_id, created_at desc);

alter table public.commercial_activities enable row level security;
revoke all on public.commercial_activities from public, anon, authenticated;
grant select, insert, update, delete on public.commercial_activities to service_role;

-- ── Registrar una actividad y actualizar el contacto (todo o nada) ──────────
-- p_claim: quien registra es dueño/administrador y puede tomar un contacto
-- sin responsable. Un vendedor solo registra en los suyos.
-- p_status null = el estado no cambia. Una nota no mueve la próxima acción.
create or replace function public.log_commercial_activity(
  p_store uuid, p_actor uuid, p_contact uuid, p_kind text, p_result text, p_note text,
  p_quote numeric, p_sale numeric, p_next_action text, p_next_at date, p_status text, p_claim boolean
) returns public.commercial_activities
language plpgsql security definer set search_path = '' as $$
declare
  c     public.contacts%rowtype;
  v_row public.commercial_activities%rowtype;
begin
  select * into c from public.contacts where id = p_contact and store_id = p_store for update;
  if not found then raise exception 'Contacto no encontrado' using errcode = 'P0002'; end if;
  if c.owner_id is distinct from p_actor and not (c.owner_id is null and coalesce(p_claim, false)) then
    raise exception 'Este contacto lo trabaja otra persona del equipo' using errcode = 'P0001';
  end if;

  insert into public.commercial_activities (
    store_id, contact_id, user_id, kind, result, note, quote_amount, sale_amount,
    next_action, next_action_at, is_followup
  ) values (
    p_store, p_contact, p_actor, p_kind, p_result, nullif(btrim(p_note), ''), p_quote, p_sale,
    case when p_kind = 'nota' then c.next_action else p_next_action end,
    case when p_kind = 'nota' then c.next_action_at else p_next_at end,
    p_kind <> 'nota' and c.last_activity_at is not null
  ) returning * into v_row;

  update public.contacts set
    owner_id          = coalesce(c.owner_id, p_actor),
    commercial_status = coalesce(p_status, c.commercial_status),
    next_action       = v_row.next_action,
    next_action_at    = v_row.next_action_at,
    last_activity_at  = case when p_kind = 'nota' then c.last_activity_at else v_row.created_at end,
    last_result       = coalesce(p_result, c.last_result),
    last_note         = coalesce(v_row.note, c.last_note),
    no_answer_streak  = case when p_result = 'no_contesta' then c.no_answer_streak + 1
                             when p_result is null then c.no_answer_streak else 0 end,
    updated_at        = now()
  where id = p_contact and store_id = p_store;

  return v_row;
end $$;
revoke all on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.log_commercial_activity(uuid, uuid, uuid, text, text, text, numeric, numeric, text, date, text, boolean) to service_role;

-- ── Vendedor desactivado: sus contactos vuelven a "Sin asignar" ─────────────
-- (si se le quita del equipo, la llave foránea ya los deja sin responsable)
create or replace function public.release_contacts_of_inactive_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' then
    update public.contacts set owner_id = null
      where store_id = new.store_id and owner_id = new.user_id;
  end if;
  return new;
end $$;
revoke all on function public.release_contacts_of_inactive_member() from public, anon, authenticated;

create trigger store_members_release_contacts
  after update of status on public.store_members
  for each row when (old.status is distinct from new.status)
  execute function public.release_contacts_of_inactive_member();
