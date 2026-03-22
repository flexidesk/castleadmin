-- ============================================================
-- Driver Documents & Verification Status
-- ============================================================

-- 1. Add verification_status column to drivers
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';

-- 2. Create driver_documents table
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL, -- 'license' | 'insurance' | 'other'
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  expiry_date DATE,
  notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_documents_driver_id ON public.driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_documents_doc_type ON public.driver_documents(doc_type);

-- 3. Enable RLS
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "authenticated_read_driver_docs" ON public.driver_documents;
CREATE POLICY "authenticated_read_driver_docs"
ON public.driver_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_driver_docs" ON public.driver_documents;
CREATE POLICY "authenticated_manage_driver_docs"
ON public.driver_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read_driver_docs" ON public.driver_documents;
CREATE POLICY "anon_read_driver_docs"
ON public.driver_documents FOR SELECT TO anon USING (true);
