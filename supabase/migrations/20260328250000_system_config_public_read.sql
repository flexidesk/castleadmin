-- Allow anon (driver portal) to read system_config for terms of hire display

DROP POLICY IF EXISTS "public_read_system_config" ON public.system_config;
CREATE POLICY "public_read_system_config"
ON public.system_config FOR SELECT TO anon
USING (true);
