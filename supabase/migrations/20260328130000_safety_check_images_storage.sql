-- Safety Check Images Storage
-- Creates storage bucket for vehicle safety check images

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'safety-check-images',
  'safety-check-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for safety-check-images bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'safety_check_images_public_read'
  ) THEN
    CREATE POLICY "safety_check_images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'safety-check-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'safety_check_images_auth_upload'
  ) THEN
    CREATE POLICY "safety_check_images_auth_upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'safety-check-images');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'safety_check_images_auth_delete'
  ) THEN
    CREATE POLICY "safety_check_images_auth_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'safety-check-images');
  END IF;
END $$;
