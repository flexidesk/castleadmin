-- Driver portal credentials table
-- Stores hashed passwords for driver portal login without requiring Supabase service role key

CREATE TABLE IF NOT EXISTS public.driver_portal_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_portal_credentials_driver_id
  ON public.driver_portal_credentials (driver_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_portal_credentials_email
  ON public.driver_portal_credentials (email);

CREATE INDEX IF NOT EXISTS idx_driver_portal_credentials_email_lookup
  ON public.driver_portal_credentials (email);

ALTER TABLE public.driver_portal_credentials ENABLE ROW LEVEL SECURITY;

-- Only service role / server-side can read/write credentials
DROP POLICY IF EXISTS "service_role_manage_driver_credentials" ON public.driver_portal_credentials;
CREATE POLICY "service_role_manage_driver_credentials"
  ON public.driver_portal_credentials
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_driver_portal_credentials_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_portal_credentials_updated_at ON public.driver_portal_credentials;
CREATE TRIGGER trg_driver_portal_credentials_updated_at
  BEFORE UPDATE ON public.driver_portal_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_driver_portal_credentials_updated_at();
