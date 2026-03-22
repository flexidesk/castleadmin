-- ============================================================
-- Driver Portal Schema (idempotent)
-- ============================================================

-- 1. Add auth_user_id to drivers table (links a driver to a Supabase auth user)
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_auth_user_id ON public.drivers(auth_user_id);

-- 2. Create driver_pod_submissions table for proof-of-delivery data
CREATE TABLE IF NOT EXISTS public.driver_pod_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  signed_by TEXT NOT NULL,
  signature_data_url TEXT,
  notes TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_pod_order_id ON public.driver_pod_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_pod_driver_id ON public.driver_pod_submissions(driver_id);

-- 3. Enable RLS
ALTER TABLE public.driver_pod_submissions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "authenticated_read_pod" ON public.driver_pod_submissions;
CREATE POLICY "authenticated_read_pod"
ON public.driver_pod_submissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_pod" ON public.driver_pod_submissions;
CREATE POLICY "authenticated_manage_pod"
ON public.driver_pod_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Trigger for updated_at
DROP TRIGGER IF EXISTS set_driver_pod_updated_at ON public.driver_pod_submissions;
CREATE TRIGGER set_driver_pod_updated_at
  BEFORE UPDATE ON public.driver_pod_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
