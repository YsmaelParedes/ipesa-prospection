-- Litro pasa de 50 a 200 contactos (1.59.0): alcanza para importar una buena
-- parte de la base y usar el CRM de verdad antes de decidir un plan.
-- Gemela de PLANS.litro.maxContacts en lib/stores.ts.
create or replace function public.plan_quota(p_plan text, p_kind text)
returns integer
language sql immutable
set search_path to ''
as $$
  select case
    when p_plan = 'litro' and p_kind = 'contacts' then 200
    when p_plan = 'litro' and p_kind = 'leads' then 10
    else null
  end
$$;
