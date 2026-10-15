-- ════════════════════════════════════════════════════════════════════════════
-- Altas por invitación y sin prueba gratis (etapa 5)
--
--   · stores.status: nuevo valor 'pending' ("Por activar"). Una tienda nueva
--     nace así: existe y su dueño puede configurarla, pero queda en solo
--     lectura hasta que se registre su primer pago (o una cortesía), que la
--     pasa a 'active' (record_store_payment). Ya no hay prueba gratis.
--   · store_invitations.role: nuevo valor 'owner'. El panel del dueño de la
--     plataforma crea la tienda e invita a su dueño con un enlace.
--
-- No modifica datos existentes: solo amplía los valores permitidos y cambia
-- el valor por omisión de stores.status ('trial' → 'pending').
-- ════════════════════════════════════════════════════════════════════════════

set lock_timeout = '8s';

alter table public.stores drop constraint stores_status_check;
alter table public.stores add constraint stores_status_check
  check (status in ('pending', 'trial', 'active', 'suspended', 'cancelled'));
alter table public.stores alter column status set default 'pending';

alter table public.store_invitations drop constraint store_invitations_role_check;
alter table public.store_invitations add constraint store_invitations_role_check
  check (role in ('owner', 'admin', 'employee'));
