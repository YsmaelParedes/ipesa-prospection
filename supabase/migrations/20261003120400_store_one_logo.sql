-- La tienda original conserva su logo de sucursal, que viene incluido en la
-- app (public/logos/). El logo genérico de IPESA queda para la plataforma y
-- para las tiendas que aún no suben el suyo.
update public.stores
   set logo_path = '/logos/ipesa-lomas-de-angelopolis.png', updated_at = now()
 where id = '3940d7e6-9807-43fa-9f19-f0a2efd743ce'
   and logo_path is null;
