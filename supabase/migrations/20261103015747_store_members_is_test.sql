-- ════════════════════════════════════════════════════════════════════════════
-- Cuentas de prueba
--
-- Lo que hace una persona marcada como de prueba (llamadas, cotizaciones,
-- ventas, oportunidades) no cuenta en los números del equipo: Equipo,
-- Acumulado, Inicio y Oportunidades. Tampoco aparece en las tablas de
-- vendedores. Su propia vista (Hoy, su agenda) funciona igual, para probar.
--
-- Solo el servidor (service_role) lee store_members; no cambian permisos.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.store_members
  add column if not exists is_test boolean not null default false;

comment on column public.store_members.is_test is
  'Cuenta de prueba: su actividad no cuenta en los números del equipo.';
