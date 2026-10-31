-- La invitación ya no crea cuentas: quien la recibe entra con su cuenta (o la
-- crea en /registro) y después la acepta. auth_user_id_by_email solo servía
-- para decidir si el enlace ofrecía crear la cuenta; ya nadie la llama.
--
drop function if exists public.auth_user_id_by_email(text);
