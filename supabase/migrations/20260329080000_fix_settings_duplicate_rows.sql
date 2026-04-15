-- Fix duplicate rows in settings tables
-- Keep only the oldest (first created) row in each singleton settings table

-- fleet_config: keep oldest row, delete rest
DO $$
DECLARE
  keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.fleet_config ORDER BY updated_at ASC NULLS LAST LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.fleet_config WHERE id != keep_id;
  END IF;
END $$;

-- company_profile: keep oldest row, delete rest
DO $$
DECLARE
  keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.company_profile ORDER BY updated_at ASC NULLS LAST LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.company_profile WHERE id != keep_id;
  END IF;
END $$;

-- driver_rate_settings: keep oldest row, delete rest
DO $$
DECLARE
  keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.driver_rate_settings ORDER BY updated_at ASC NULLS LAST LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.driver_rate_settings WHERE id != keep_id;
  END IF;
END $$;

-- notification_preferences: keep oldest row, delete rest
DO $$
DECLARE
  keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.notification_preferences ORDER BY updated_at ASC NULLS LAST LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.notification_preferences WHERE id != keep_id;
  END IF;
END $$;

-- alert_thresholds: keep oldest row, delete rest
DO $$
DECLARE
  keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.alert_thresholds ORDER BY updated_at ASC NULLS LAST LIMIT 1;
  IF keep_id IS NOT NULL THEN
    DELETE FROM public.alert_thresholds WHERE id != keep_id;
  END IF;
END $$;
