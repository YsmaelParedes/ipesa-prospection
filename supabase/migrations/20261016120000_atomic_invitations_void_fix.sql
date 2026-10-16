-- ════════════════════════════════════════════════════════════════════════════
-- Auditoría 2026-10-15
--
--   · accept_store_invitation: aceptar una invitación es TODO o NADA. Antes se
--     marcaba como usada y luego se creaba la membresía en dos pasos: si el
--     segundo fallaba, el enlace quedaba quemado sin dar acceso. Además ahora
--     se revisa, con la tienda bloqueada, el plan VIGENTE (lugares y si permite
--     administradores) y que no exista ya un dueño activo.
--     Los límites de cada plan llegan del servidor (p_plans = PLANS de
--     lib/stores.ts) para no duplicar las reglas.
--   · void_store_payment: anular un pago ya no revive una tienda que el dueño
--     de la plataforma suspendió o canceló después del pago. Solo se restaura
--     si la tienda sigue tal como la dejó ese pago (activa y con la misma
--     vigencia).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.accept_store_invitation(p_invitation uuid, p_user uuid, p_plans jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  inv   public.store_invitations%rowtype;
  s     public.stores%rowtype;
  v_plan jsonb;
  v_max  integer;
  v_seats integer;
  v_existing public.store_members%rowtype;
begin
  select * into inv from public.store_invitations where id = p_invitation;
  if not found then raise exception 'Esta invitación no existe' using errcode = 'P0002'; end if;

  -- Mismo orden de bloqueo que record/void_store_payment: primero la tienda
  select * into s from public.stores where id = inv.store_id for update;
  if not found then raise exception 'Esta invitación no existe' using errcode = 'P0002'; end if;
  select * into inv from public.store_invitations where id = p_invitation for update;

  if inv.revoked_at is not null then raise exception 'La invitación fue cancelada.' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'Esta invitación ya se usó.' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'La invitación venció. Pide una nueva.' using errcode = 'P0001'; end if;

  v_plan := coalesce(p_plans -> s.plan, p_plans -> 'profesional');
  v_max  := coalesce((v_plan ->> 'maxUsers')::integer, 3);

  if inv.role = 'admin' and not coalesce((v_plan ->> 'allowAdmins')::boolean, false) then
    raise exception 'El plan de la tienda ya no permite administradores. Pide una invitación como vendedor.' using errcode = 'P0001';
  end if;
  if inv.role = 'owner' and exists (
    select 1 from public.store_members
     where store_id = s.id and role = 'owner' and status = 'active' and user_id <> p_user
  ) then
    raise exception 'Esta tienda ya tiene dueño.' using errcode = 'P0001';
  end if;

  select * into v_existing from public.store_members where store_id = s.id and user_id = p_user;
  if not found then
    select count(*) into v_seats from public.store_members where store_id = s.id and status = 'active';
    if v_seats >= v_max then
      raise exception 'El equipo de esta tienda ya está completo. Pide al dueño que libere un lugar.' using errcode = 'P0001';
    end if;
    insert into public.store_members (store_id, user_id, role, status) values (s.id, p_user, inv.role, 'active');
  end if;
  -- Si ya era miembro (activo o desactivado) se respeta lo que decidió el dueño

  update public.store_invitations set accepted_at = now(), accepted_by = p_user where id = inv.id;
  return jsonb_build_object('store_id', s.id, 'already_member', v_existing.user_id is not null);
end $$;

revoke all on function public.accept_store_invitation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.accept_store_invitation(uuid, uuid, jsonb) to service_role;

create or replace function public.void_store_payment(p_payment uuid, p_actor uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.store_payments%rowtype;
  s public.stores%rowtype;
  v_restored boolean := false;
begin
  select * into p from public.store_payments where id = p_payment;
  if not found then raise exception 'Pago no encontrado' using errcode = 'P0002'; end if;
  select * into s from public.stores where id = p.store_id for update;
  select * into p from public.store_payments where id = p_payment for update;

  if p.voided_at is not null then raise exception 'Este pago ya estaba anulado' using errcode = 'P0001'; end if;
  if exists (select 1 from public.store_payments
              where store_id = p.store_id and voided_at is null and id <> p.id and created_at > p.created_at) then
    raise exception 'Primero anula los pagos más recientes de esta tienda' using errcode = 'P0001';
  end if;

  update public.store_payments
     set voided_at = now(), voided_by = p_actor, void_reason = nullif(trim(p_reason), '')
   where id = p.id
  returning * into p;

  -- Solo si la tienda sigue como la dejó el pago (record_store_payment la pone
  -- 'active'); una suspensión o cancelación posterior se respeta.
  if s.status = 'active' and s.paid_until is not distinct from p.period_end then
    update public.stores set status = p.prev_status, paid_until = p.prev_paid_until, updated_at = now() where id = s.id;
    v_restored := true;
  end if;

  insert into public.platform_events (store_id, actor_id, action, detail)
  values (s.id, p_actor, 'payment_void', jsonb_build_object(
    'payment_id', p.id, 'amount', p.amount, 'reason', p.void_reason, 'restored', v_restored,
    'paid_until', case when v_restored then p.prev_paid_until else s.paid_until end));

  return jsonb_build_object('payment', to_jsonb(p), 'restored', v_restored);
end $$;

revoke all on function public.void_store_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.void_store_payment(uuid, uuid, text) to service_role;
