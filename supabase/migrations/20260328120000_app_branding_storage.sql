-- App Branding Storage: bucket for logo and favicon uploads

-- Create storage bucket for app branding assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-branding',
  'app-branding',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to app-branding bucket
DROP POLICY IF EXISTS "app_branding_upload" ON storage.objects;
CREATE POLICY "app_branding_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-branding');

DROP POLICY IF EXISTS "app_branding_update" ON storage.objects;
CREATE POLICY "app_branding_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'app-branding');

DROP POLICY IF EXISTS "app_branding_delete" ON storage.objects;
CREATE POLICY "app_branding_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'app-branding');

DROP POLICY IF EXISTS "app_branding_public_read" ON storage.objects;
CREATE POLICY "app_branding_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'app-branding');

-- Add branding columns to fleet_config if it exists
ALTER TABLE public.fleet_config
ADD COLUMN IF NOT EXISTS app_logo_url TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS app_favicon_url TEXT DEFAULT NULL;
