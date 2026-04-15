-- Insert test driver and portal credentials for test@test.com / 123456
-- Password hash: SHA256('castle-driver-salt' + '123456' + 'castle-driver-salt')
-- Uses pgcrypto digest function (pre-installed in Supabase)

DO $$
DECLARE
  v_driver_id UUID;
  v_password_hash TEXT;
BEGIN
  -- Compute the password hash using the same logic as the login route
  -- hashPassword = sha256(salt + password + salt) where salt = 'castle-driver-salt'
  v_password_hash := encode(digest('castle-driver-salt' || '123456' || 'castle-driver-salt', 'sha256'), 'hex');

  -- Check if a driver with email test@test.com already exists
  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE email = 'test@test.com'
  LIMIT 1;

  -- If no driver found, insert one
  IF v_driver_id IS NULL THEN
    INSERT INTO public.drivers (
      id,
      name,
      email,
      phone,
      vehicle,
      plate,
      status,
      is_active,
      verification_status
    ) VALUES (
      gen_random_uuid(),
      'Test Driver',
      'test@test.com',
      '07000000000',
      'Van',
      'TEST123',
      'Available',
      true,
      'verified'
    )
    RETURNING id INTO v_driver_id;
  END IF;

  -- Upsert the portal credential for test@test.com
  -- Delete existing credential for this email first (handles email conflict)
  DELETE FROM public.driver_portal_credentials
  WHERE email = 'test@test.com';

  -- Also remove any credential tied to this driver_id (handles driver_id unique constraint)
  DELETE FROM public.driver_portal_credentials
  WHERE driver_id = v_driver_id;

  -- Insert fresh credential
  INSERT INTO public.driver_portal_credentials (
    id,
    driver_id,
    email,
    password_hash
  ) VALUES (
    gen_random_uuid(),
    v_driver_id,
    'test@test.com',
    v_password_hash
  );

  RAISE NOTICE 'Test driver credential created: driver_id=%, email=test@test.com, password=123456', v_driver_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Failed to create test driver credential: %', SQLERRM;
END $$;
