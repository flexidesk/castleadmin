-- ─── Customers Module ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT NOT NULL,
  address         TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_email  ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone  ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_active ON public.customers(is_active);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_customers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customers_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_customers" ON public.customers;
CREATE POLICY "authenticated_manage_customers"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─── Mock Data ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO public.customers (id, name, email, phone, address, notes, is_active) VALUES
    (gen_random_uuid(), 'Alice Thornton',    'alice.thornton@email.com',   '+1 555-0101', '12 Oak Street, Melbourne VIC 3000',   'Prefers morning deliveries',          true),
    (gen_random_uuid(), 'Bob Hargreaves',    'bob.hargreaves@email.com',   '+1 555-0102', '45 Pine Ave, Sydney NSW 2000',         'Leave at door if no answer',          true),
    (gen_random_uuid(), 'Carol Nguyen',      'carol.nguyen@email.com',     '+1 555-0103', '78 Maple Rd, Brisbane QLD 4000',       'Fragile items only',                  true),
    (gen_random_uuid(), 'David Okafor',      'david.okafor@email.com',     '+1 555-0104', '3 Elm Court, Perth WA 6000',           NULL,                                  true),
    (gen_random_uuid(), 'Emma Fitzgerald',   'emma.fitz@email.com',        '+1 555-0105', '99 Birch Blvd, Adelaide SA 5000',      'Call before delivery',                true),
    (gen_random_uuid(), 'Frank Delacroix',   'frank.d@email.com',          '+1 555-0106', '22 Cedar Lane, Hobart TAS 7000',       NULL,                                  true),
    (gen_random_uuid(), 'Grace Yamamoto',    'grace.y@email.com',          '+1 555-0107', '55 Willow Way, Darwin NT 0800',        'Business account',                    true),
    (gen_random_uuid(), 'Henry Blackwood',   'henry.b@email.com',          '+1 555-0108', '8 Spruce St, Canberra ACT 2600',       'Deactivated by request',              false)
  ON CONFLICT (id) DO NOTHING;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Customer mock data insertion failed: %', SQLERRM;
END $$;
