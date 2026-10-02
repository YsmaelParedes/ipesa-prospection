-- ════════════════════════════════════════════════════════════════════════════
-- CRM Pinturas — esquema de Supabase (multi-tienda), foto al 2026-10-03
--
-- Generado con pg_dump (solo esquema "public") a partir de una base que corre
-- el esquema anterior + las migraciones 20261003120000 … 20261003120400, es
-- decir, como queda producción después de aplicar la migración de cierre
-- (20261003120100_multi_store_finalize.sql). Es una REFERENCIA: los cambios se
-- hacen con migraciones nuevas en supabase/migrations/, nunca editando esto.
--
-- Modelo de acceso
--   · Toda lectura/escritura pasa por las API routes de Next.js con la
--     service_role key (bypassa RLS; Supabase le da todos los privilegios por
--     omisión). anon/authenticated no tienen privilegios sobre public.
--   · Multi-tienda: cada tabla de negocio lleva store_id (FK a stores, borrado
--     en cascada) y las referencias entre tablas son compuestas
--     (store_id, id), así un registro nunca puede apuntar a otra tienda.
--   · Membresías y roles por tienda en store_members (owner/admin/employee);
--     administradores de la plataforma en platform_admins.
--   · Funciones SECURITY DEFINER con search_path vacío, ejecutables solo por
--     service_role.
--   · Storage (fuera de este archivo): buckets públicos "whatsapp-media"
--     (JPEG/PNG ≤ 5 MB) y "store-assets" (logos PNG/JPEG/WebP ≤ 2 MB).
-- ════════════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.auth_user_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id from auth.users u where lower(u.email::text) = lower(trim(p_email)) limit 1;
$$;

CREATE FUNCTION public.platform_store_overview() RETURNS TABLE(id uuid, slug text, name text, city text, state text, phone text, status text, plan text, trial_ends_at timestamp with time zone, paid_until timestamp with time zone, created_at timestamp with time zone, onboarding_completed_at timestamp with time zone, platform_notes text, owner_email text, owner_name text, members integer, contacts integer, leads integer, whatsapp_connected boolean, last_activity_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.id, s.slug, s.name, s.city, s.state, s.phone, s.status, s.plan,
         s.trial_ends_at, s.paid_until, s.created_at, s.onboarding_completed_at, s.platform_notes,
         o.email::text,
         coalesce(nullif(trim(o.raw_user_meta_data ->> 'display_name'), ''), split_part(o.email::text, '@', 1)),
         (select count(*)::int from public.store_members m where m.store_id = s.id and m.status = 'active'),
         (select count(*)::int from public.contacts c where c.store_id = s.id),
         (select count(*)::int from public.leads l where l.store_id = s.id),
         exists (select 1 from public.store_whatsapp w
                 where w.store_id = s.id and (w.credentials_source = 'env' or w.access_token_enc is not null)),
         greatest(
           (select max(l.created_at) from public.leads l where l.store_id = s.id),
           (select max(w.created_at) from public.whatsapp_messages w where w.store_id = s.id),
           (select max(o2.last_sign_in_at) from public.store_members m2 join auth.users o2 on o2.id = m2.user_id where m2.store_id = s.id)
         )
  from public.stores s
  left join lateral (
    select u.email, u.raw_user_meta_data from public.store_members m
    join auth.users u on u.id = m.user_id
    where m.store_id = s.id and m.role = 'owner'
    order by m.created_at limit 1
  ) o on true
  order by s.created_at desc;
$$;

CREATE FUNCTION public.store_member_directory(p_store uuid) RETURNS TABLE(user_id uuid, email text, display_name text, role text, status text, joined_at timestamp with time zone, last_sign_in_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select m.user_id,
         u.email::text,
         coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email::text, '@', 1)),
         m.role, m.status, m.created_at, u.last_sign_in_at
  from public.store_members m
  join auth.users u on u.id = m.user_id
  where m.store_id = p_store
  order by m.created_at;
$$;

CREATE TABLE public.app_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    store_id uuid NOT NULL,
    CONSTRAINT app_config_type_check CHECK ((type = ANY (ARRAY['segment'::text, 'canal'::text])))
);

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20) NOT NULL,
    company character varying(255),
    address text,
    postal_code text,
    segment character varying(100),
    acquisition_channel text DEFAULT ''::text,
    email text DEFAULT ''::text,
    prospect_status character varying(50) DEFAULT 'nuevo'::character varying,
    wa_opt_out boolean DEFAULT false NOT NULL,
    wa_opt_out_at timestamp with time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    store_id uuid NOT NULL
);

CREATE TABLE public.lead_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    user_id uuid,
    type text DEFAULT 'note'::text NOT NULL,
    description text,
    amount numeric,
    activity_date timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    store_id uuid NOT NULL
);

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    canal text DEFAULT 'Otro'::text NOT NULL,
    segmento text DEFAULT 'Residencial'::text NOT NULL,
    estado text DEFAULT 'Nuevo'::text NOT NULL,
    monto numeric,
    notas text,
    contact_id uuid,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    store_id uuid NOT NULL
);

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_id uuid,
    notify_whatsapp boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reminder_date timestamp without time zone NOT NULL,
    lead_id uuid,
    lead_name text DEFAULT ''::text NOT NULL,
    nota text DEFAULT ''::text NOT NULL,
    completado boolean DEFAULT false NOT NULL,
    completado_at timestamp with time zone,
    user_id uuid,
    type text DEFAULT 'task'::text,
    priority text DEFAULT 'medium'::text,
    push_sent boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    store_id uuid NOT NULL
);

CREATE TABLE public.store_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id uuid NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'employee'::text NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    accepted_by uuid,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_invitations_email_check CHECK (((char_length(email) >= 3) AND (char_length(email) <= 254))),
    CONSTRAINT store_invitations_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text])))
);

CREATE TABLE public.store_members (
    store_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'employee'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'employee'::text]))),
    CONSTRAINT store_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

CREATE TABLE public.store_whatsapp (
    store_id uuid NOT NULL,
    credentials_source text DEFAULT 'store'::text NOT NULL,
    phone_number_id text,
    waba_id text,
    display_phone text,
    access_token_enc text,
    app_secret_enc text,
    verify_token text NOT NULL,
    webhook_key text NOT NULL,
    connected_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT store_whatsapp_credentials_source_check CHECK ((credentials_source = ANY (ARRAY['store'::text, 'env'::text])))
);

CREATE TABLE public.stores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    address text,
    city text,
    state text,
    logo_path text,
    timezone text DEFAULT 'America/Mexico_City'::text NOT NULL,
    status text DEFAULT 'trial'::text NOT NULL,
    plan text DEFAULT 'profesional'::text NOT NULL,
    trial_ends_at timestamp with time zone,
    paid_until timestamp with time zone,
    modules jsonb DEFAULT '{"formulas": true, "whatsapp": true, "campaigns": true}'::jsonb NOT NULL,
    platform_notes text,
    onboarding_completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stores_address_check CHECK ((char_length(address) <= 300)),
    CONSTRAINT stores_city_check CHECK ((char_length(city) <= 80)),
    CONSTRAINT stores_email_check CHECK ((char_length(email) <= 254)),
    CONSTRAINT stores_name_check CHECK (((char_length(name) >= 2) AND (char_length(name) <= 80))),
    CONSTRAINT stores_phone_check CHECK ((char_length(phone) <= 20)),
    CONSTRAINT stores_slug_check CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND ((char_length(slug) >= 3) AND (char_length(slug) <= 60)))),
    CONSTRAINT stores_state_check CHECK ((char_length(state) <= 80)),
    CONSTRAINT stores_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'suspended'::text, 'cancelled'::text])))
);

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid,
    phone text NOT NULL,
    direction text NOT NULL,
    body text,
    wa_message_id text,
    status text DEFAULT 'received'::text NOT NULL,
    template_name text,
    error_message text,
    user_id uuid,
    media_id text,
    media_type text,
    media_mime text,
    profile_name text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL,
    CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text])))
);

CREATE TABLE public.whatsapp_quick_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    store_id uuid NOT NULL,
    CONSTRAINT whatsapp_quick_replies_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 1000))),
    CONSTRAINT whatsapp_quick_replies_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 60)))
);

CREATE VIEW public.whatsapp_threads WITH (security_invoker='true') AS
 SELECT DISTINCT ON (store_id, phone) phone,
    body AS last_body,
    direction AS last_direction,
    status AS last_status,
    media_type AS last_media_type,
    template_name AS last_template,
    created_at AS last_at,
    ( SELECT (count(*))::integer AS count
           FROM public.whatsapp_messages u
          WHERE ((u.store_id = m.store_id) AND (u.phone = m.phone) AND (u.direction = 'inbound'::text) AND (u.read_at IS NULL))) AS unread,
    ( SELECT max(i.created_at) AS max
           FROM public.whatsapp_messages i
          WHERE ((i.store_id = m.store_id) AND (i.phone = m.phone) AND (i.direction = 'inbound'::text))) AS last_inbound_at,
    ( SELECT p.profile_name
           FROM public.whatsapp_messages p
          WHERE ((p.store_id = m.store_id) AND (p.phone = m.phone) AND (p.profile_name IS NOT NULL))
          ORDER BY p.created_at DESC
         LIMIT 1) AS profile_name,
    ( SELECT c.contact_id
           FROM public.whatsapp_messages c
          WHERE ((c.store_id = m.store_id) AND (c.phone = m.phone) AND (c.contact_id IS NOT NULL))
          ORDER BY c.created_at DESC
         LIMIT 1) AS contact_id,
    store_id
   FROM public.whatsapp_messages m
  ORDER BY store_id, phone, created_at DESC;

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_store_type_label_key UNIQUE (store_id, type, label);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_store_id_id_key UNIQUE (store_id, id);

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_store_phone_key UNIQUE (store_id, phone);

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_store_id_id_key UNIQUE (store_id, id);

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_invitations
    ADD CONSTRAINT store_invitations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.store_invitations
    ADD CONSTRAINT store_invitations_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.store_members
    ADD CONSTRAINT store_members_pkey PRIMARY KEY (store_id, user_id);

ALTER TABLE ONLY public.store_whatsapp
    ADD CONSTRAINT store_whatsapp_phone_number_id_key UNIQUE (phone_number_id);

ALTER TABLE ONLY public.store_whatsapp
    ADD CONSTRAINT store_whatsapp_pkey PRIMARY KEY (store_id);

ALTER TABLE ONLY public.store_whatsapp
    ADD CONSTRAINT store_whatsapp_webhook_key_key UNIQUE (webhook_key);

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.whatsapp_quick_replies
    ADD CONSTRAINT whatsapp_quick_replies_pkey PRIMARY KEY (id);

CREATE INDEX contacts_store_created_idx ON public.contacts USING btree (store_id, created_at DESC);

CREATE INDEX idx_contacts_segment ON public.contacts USING btree (segment);

CREATE INDEX idx_lead_activities_date ON public.lead_activities USING btree (activity_date DESC);

CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities USING btree (lead_id);

CREATE INDEX idx_lead_activities_user_id ON public.lead_activities USING btree (user_id);

CREATE INDEX idx_leads_user_id ON public.leads USING btree (user_id);

CREATE INDEX idx_reminders_date ON public.reminders USING btree (reminder_date);

CREATE INDEX lead_activities_store_idx ON public.lead_activities USING btree (store_id);

CREATE INDEX leads_contact_id_idx ON public.leads USING btree (contact_id);

CREATE INDEX leads_created_at_idx ON public.leads USING btree (created_at DESC);

CREATE INDEX leads_store_created_idx ON public.leads USING btree (store_id, created_at DESC);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);

CREATE INDEX reminders_lead_id_idx ON public.reminders USING btree (lead_id);

CREATE INDEX reminders_pending_push_idx ON public.reminders USING btree (reminder_date) WHERE ((completado = false) AND (push_sent = false));

CREATE INDEX reminders_store_user_idx ON public.reminders USING btree (store_id, user_id);

CREATE INDEX reminders_user_id_idx ON public.reminders USING btree (user_id);

CREATE INDEX store_invitations_store_idx ON public.store_invitations USING btree (store_id, created_at DESC);

CREATE INDEX store_members_user_idx ON public.store_members USING btree (user_id);

CREATE UNIQUE INDEX store_whatsapp_env_source_idx ON public.store_whatsapp USING btree (credentials_source) WHERE (credentials_source = 'env'::text);

CREATE INDEX whatsapp_messages_contact_idx ON public.whatsapp_messages USING btree (contact_id);

CREATE INDEX whatsapp_messages_store_phone_idx ON public.whatsapp_messages USING btree (store_id, phone, created_at DESC);

CREATE INDEX whatsapp_messages_store_template_idx ON public.whatsapp_messages USING btree (store_id, created_at DESC) WHERE ((direction = 'outbound'::text) AND (template_name IS NOT NULL));

CREATE INDEX whatsapp_messages_store_unread_idx ON public.whatsapp_messages USING btree (store_id, phone) WHERE ((direction = 'inbound'::text) AND (read_at IS NULL));

CREATE UNIQUE INDEX whatsapp_messages_wa_id_idx ON public.whatsapp_messages USING btree (wa_message_id) WHERE (wa_message_id IS NOT NULL);

CREATE INDEX whatsapp_quick_replies_store_idx ON public.whatsapp_quick_replies USING btree (store_id);

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_same_store_fkey FOREIGN KEY (store_id, lead_id) REFERENCES public.leads(store_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_contact_same_store_fkey FOREIGN KEY (store_id, contact_id) REFERENCES public.contacts(store_id, id) ON DELETE SET NULL (contact_id);

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_lead_same_store_fkey FOREIGN KEY (store_id, lead_id) REFERENCES public.leads(store_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_invitations
    ADD CONSTRAINT store_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_invitations
    ADD CONSTRAINT store_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.store_invitations
    ADD CONSTRAINT store_invitations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_members
    ADD CONSTRAINT store_members_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_members
    ADD CONSTRAINT store_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.store_whatsapp
    ADD CONSTRAINT store_whatsapp_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stores
    ADD CONSTRAINT stores_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_contact_same_store_fkey FOREIGN KEY (store_id, contact_id) REFERENCES public.contacts(store_id, id) ON DELETE SET NULL (contact_id);

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.whatsapp_quick_replies
    ADD CONSTRAINT whatsapp_quick_replies_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_activities_user_only ON public.lead_activities TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_user_only ON public.leads TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subs_user_only ON public.push_subscriptions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminders_user_only ON public.reminders TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.store_whatsapp ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_user_id_by_email(p_email text) TO service_role;

REVOKE ALL ON FUNCTION public.platform_store_overview() FROM PUBLIC;
GRANT ALL ON FUNCTION public.platform_store_overview() TO service_role;

REVOKE ALL ON FUNCTION public.store_member_directory(p_store uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.store_member_directory(p_store uuid) TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.platform_admins TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.store_invitations TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.store_members TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.store_whatsapp TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.stores TO service_role;

GRANT SELECT ON TABLE public.whatsapp_threads TO service_role;
