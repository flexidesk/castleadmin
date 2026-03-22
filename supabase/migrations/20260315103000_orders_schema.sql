-- ============================================================
-- Orders Dashboard Schema
-- ============================================================

-- 1. ENUM TYPES
DROP TYPE IF EXISTS public.booking_status CASCADE;
CREATE TYPE public.booking_status AS ENUM (
  'Booking Accepted',
  'Booking Assigned',
  'Booking Out For Delivery',
  'Booking Complete',
  'Booking Cancelled'
);

DROP TYPE IF EXISTS public.booking_type CASCADE;
CREATE TYPE public.booking_type AS ENUM ('Delivery', 'Collection');

DROP TYPE IF EXISTS public.payment_status CASCADE;
CREATE TYPE public.payment_status AS ENUM ('Paid', 'Unpaid', 'Partial');

DROP TYPE IF EXISTS public.payment_method CASCADE;
CREATE TYPE public.payment_method AS ENUM ('Card', 'Cash', 'Unrecorded');

DROP TYPE IF EXISTS public.driver_status CASCADE;
CREATE TYPE public.driver_status AS ENUM ('Available', 'On Route', 'Off Duty');

-- 2. CORE TABLES

CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  plate TEXT NOT NULL,
  status public.driver_status DEFAULT 'Available'::public.driver_status,
  avatar TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  woo_order_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  booking_type public.booking_type NOT NULL,
  status public.booking_status DEFAULT 'Booking Accepted'::public.booking_status,
  delivery_address_line1 TEXT,
  delivery_address_line2 TEXT,
  delivery_address_city TEXT,
  delivery_address_county TEXT,
  delivery_address_postcode TEXT,
  delivery_address_notes TEXT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  booking_date DATE NOT NULL,
  delivery_window TEXT NOT NULL,
  collection_window TEXT,
  payment_status public.payment_status DEFAULT 'Unpaid'::public.payment_status,
  payment_method public.payment_method DEFAULT 'Unrecorded'::public.payment_method,
  payment_amount DECIMAL(10,2) DEFAULT 0,
  payment_recorded_at TIMESTAMPTZ,
  payment_recorded_by TEXT,
  payment_notes TEXT,
  products JSONB DEFAULT '[]'::jsonb,
  pod JSONB,
  notes TEXT,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_orders_booking_date ON public.orders(booking_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON public.orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(status);

-- 4. UPDATED_AT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- 5. ENABLE RLS
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES (open access for admin dashboard — all authenticated users)
DROP POLICY IF EXISTS "authenticated_read_drivers" ON public.drivers;
CREATE POLICY "authenticated_read_drivers"
ON public.drivers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_drivers" ON public.drivers;
CREATE POLICY "authenticated_manage_drivers"
ON public.drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_orders" ON public.orders;
CREATE POLICY "authenticated_read_orders"
ON public.orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_manage_orders" ON public.orders;
CREATE POLICY "authenticated_manage_orders"
ON public.orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. TRIGGERS
DROP TRIGGER IF EXISTS set_drivers_updated_at ON public.drivers;
CREATE TRIGGER set_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_orders_updated_at ON public.orders;
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. MOCK DATA
DO $$
DECLARE
  d1 UUID := gen_random_uuid();
  d2 UUID := gen_random_uuid();
  d3 UUID := gen_random_uuid();
  d4 UUID := gen_random_uuid();
  d5 UUID := gen_random_uuid();
BEGIN
  -- Drivers
  INSERT INTO public.drivers (id, name, phone, vehicle, plate, status, avatar) VALUES
    (d1, 'Marcus Webb',    '07712 345678', 'Ford Transit',       'LN23 RKT', 'On Route'::public.driver_status,  'MW'),
    (d2, 'Priya Nair',     '07845 678901', 'Mercedes Sprinter',  'BX21 VHJ', 'Available'::public.driver_status, 'PN'),
    (d3, 'Tom Bridges',    '07923 112233', 'Ford Transit',       'YD22 MKL', 'On Route'::public.driver_status,  'TB'),
    (d4, 'Leanne Carter',  '07600 998877', 'Vauxhall Movano',    'GX20 PPT', 'Available'::public.driver_status, 'LC'),
    (d5, 'Darren Hollis',  '07711 556677', 'Mercedes Sprinter',  'KE19 ZXA', 'Off Duty'::public.driver_status,  'DH')
  ON CONFLICT (id) DO NOTHING;

  -- Orders
  INSERT INTO public.orders (
    id, woo_order_id, customer_name, customer_email, customer_phone,
    booking_type, status, delivery_address_line1, delivery_address_city,
    delivery_address_county, delivery_address_postcode, delivery_address_notes,
    driver_id, booking_date, delivery_window, collection_window,
    payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by,
    products, created_at, updated_at
  ) VALUES
  (
    'CA-1042', '#8841', 'Rachel Thornton', 'r.thornton@outlook.com', '07831 224455',
    'Delivery'::public.booking_type, 'Booking Out For Delivery'::public.booking_status,
    '14 Meadow Close', 'Leicester', 'Leicestershire', 'LE4 7RN',
    'Side gate is unlocked. Please set up in back garden.',
    d1, '2026-03-15', '08:00 - 10:00', '18:00 - 20:00',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 145.00,
    '2026-03-10T14:22:00Z', 'Sarah Atkinson',
    '[{"id":101,"name":"Frozen Elsa Castle - Large","sku":"BC-ELSA-LG","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"},{"id":102,"name":"Blower Unit 1.5kW","sku":"BLW-1500","quantity":1,"unitPrice":0,"totalPrice":0,"category":"Accessory"}]',
    '2026-03-10T14:20:00Z', '2026-03-15T08:47:00Z'
  ),
  (
    'CA-1041', '#8839', 'James Okafor', 'j.okafor@gmail.com', '07900 334455',
    'Delivery'::public.booking_type, 'Booking Assigned'::public.booking_status,
    '7 Birchwood Avenue', 'Leicester', 'Leicestershire', 'LE2 5GH', NULL,
    d3, '2026-03-15', '10:00 - 12:00', '19:00 - 21:00',
    'Unpaid'::public.payment_status, 'Cash'::public.payment_method, 175.00,
    NULL, NULL,
    '[{"id":103,"name":"Superhero Combo Castle","sku":"BC-SUPER-CMB","quantity":1,"unitPrice":175.00,"totalPrice":175.00,"category":"Combo Castle"}]',
    '2026-03-11T09:10:00Z', '2026-03-14T16:05:00Z'
  ),
  (
    'CA-1040', '#8836', 'Sonia Patel', 'sonia.patel@hotmail.co.uk', '07724 889900',
    'Delivery'::public.booking_type, 'Booking Accepted'::public.booking_status,
    '3 Rosewood Drive', 'Loughborough', 'Leicestershire', 'LE11 3PQ', NULL,
    NULL, '2026-03-15', '12:00 - 14:00', '20:00 - 22:00',
    'Unpaid'::public.payment_status, 'Unrecorded'::public.payment_method, 130.00,
    NULL, NULL,
    '[{"id":104,"name":"Princess Palace Castle - Medium","sku":"BC-PRIN-MD","quantity":1,"unitPrice":130.00,"totalPrice":130.00,"category":"Bouncy Castle"}]',
    '2026-03-12T11:30:00Z', '2026-03-12T11:30:00Z'
  ),
  (
    'CA-1039', '#8830', 'Daniel Hughes', 'd.hughes@company.co.uk', '07811 667788',
    'Delivery'::public.booking_type, 'Booking Out For Delivery'::public.booking_status,
    '22 Oak Lane', 'Hinckley', 'Leicestershire', 'LE10 0AB', NULL,
    d3, '2026-03-15', '09:00 - 11:00', '18:30 - 20:30',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 185.00,
    '2026-03-09T10:00:00Z', 'Sarah Atkinson',
    '[{"id":105,"name":"Jungle Safari Castle","sku":"BC-JUNG-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"},{"id":106,"name":"Safety Crash Mat Set","sku":"ACC-MAT-SET","quantity":2,"unitPrice":15.00,"totalPrice":30.00,"category":"Accessory"}]',
    '2026-03-09T09:55:00Z', '2026-03-15T09:15:00Z'
  ),
  (
    'CA-1038', '#8825', 'Natalie Frost', 'nat.frost@gmail.com', '07955 443322',
    'Collection'::public.booking_type, 'Booking Complete'::public.booking_status,
    'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL,
    NULL, '2026-03-14', '10:00 - 11:00', NULL,
    'Paid'::public.payment_status, 'Cash'::public.payment_method, 95.00,
    '2026-03-14T10:45:00Z', 'Sarah Atkinson',
    '[{"id":107,"name":"Classic Red & Blue Castle - Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":95.00,"totalPrice":95.00,"category":"Bouncy Castle"}]',
    '2026-03-08T15:00:00Z', '2026-03-14T10:44:00Z'
  ),
  (
    'CA-1037', '#8820', 'Connor Gallagher', 'cgallagher@live.co.uk', '07700 112233',
    'Delivery'::public.booking_type, 'Booking Complete'::public.booking_status,
    '9 Willow Street', 'Coalville', 'Leicestershire', 'LE67 3BT', NULL,
    NULL, '2026-03-14', '08:30 - 10:30', '19:00 - 21:00',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 165.00,
    '2026-03-13T17:00:00Z', 'Sarah Atkinson',
    '[{"id":108,"name":"Dinosaur Dino World Castle","sku":"BC-DINO-LG","quantity":1,"unitPrice":165.00,"totalPrice":165.00,"category":"Bouncy Castle"}]',
    '2026-03-07T10:00:00Z', '2026-03-14T09:06:00Z'
  ),
  (
    'CA-1036', '#8815', 'Amelia Rhodes', 'amelia.rhodes@yahoo.co.uk', '07888 776655',
    'Delivery'::public.booking_type, 'Booking Accepted'::public.booking_status,
    '51 Granby Street', 'Melton Mowbray', 'Leicestershire', 'LE13 1JZ', NULL,
    NULL, '2026-03-16', '09:00 - 11:00', '19:00 - 21:00',
    'Unpaid'::public.payment_status, 'Cash'::public.payment_method, 155.00,
    NULL, NULL,
    '[{"id":109,"name":"Unicorn Rainbow Castle - Large","sku":"BC-UNI-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"}]',
    '2026-03-13T14:00:00Z', '2026-03-13T14:00:00Z'
  ),
  (
    'CA-1035', '#8810', 'Ben Whitfield', 'benw@btinternet.com', '07744 998877',
    'Collection'::public.booking_type, 'Booking Assigned'::public.booking_status,
    'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL,
    d2, '2026-03-16', '11:00 - 12:00', NULL,
    'Unpaid'::public.payment_status, 'Card'::public.payment_method, 195.00,
    NULL, NULL,
    '[{"id":110,"name":"Football Pitch Inflatable","sku":"BC-FOOT-LG","quantity":1,"unitPrice":195.00,"totalPrice":195.00,"category":"Inflatable"}]',
    '2026-03-14T08:30:00Z', '2026-03-14T08:30:00Z'
  ),
  -- Extra orders for chart data (past 7 days)
  (
    'CA-1034', '#8805', 'Lucy Hargreaves', 'lucy.h@gmail.com', '07811 223344',
    'Delivery'::public.booking_type, 'Booking Complete'::public.booking_status,
    '12 Park Road', 'Leicester', 'Leicestershire', 'LE1 2AB', NULL,
    NULL, '2026-03-13', '09:00 - 11:00', '18:00 - 20:00',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 120.00,
    '2026-03-13T09:30:00Z', 'Sarah Atkinson',
    '[{"id":111,"name":"Classic Castle Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":120.00,"totalPrice":120.00,"category":"Bouncy Castle"}]',
    '2026-03-10T10:00:00Z', '2026-03-13T18:00:00Z'
  ),
  (
    'CA-1033', '#8800', 'Oliver Marsh', 'o.marsh@outlook.com', '07922 334455',
    'Delivery'::public.booking_type, 'Booking Complete'::public.booking_status,
    '5 High Street', 'Loughborough', 'Leicestershire', 'LE11 1AA', NULL,
    NULL, '2026-03-12', '10:00 - 12:00', '19:00 - 21:00',
    'Paid'::public.payment_status, 'Cash'::public.payment_method, 145.00,
    '2026-03-12T10:30:00Z', 'Sarah Atkinson',
    '[{"id":112,"name":"Pirate Ship Castle","sku":"BC-PIR-MD","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"}]',
    '2026-03-09T11:00:00Z', '2026-03-12T19:00:00Z'
  ),
  (
    'CA-1032', '#8795', 'Emma Clarke', 'emma.c@hotmail.com', '07733 445566',
    'Delivery'::public.booking_type, 'Booking Complete'::public.booking_status,
    '8 Elm Avenue', 'Hinckley', 'Leicestershire', 'LE10 1BB', NULL,
    NULL, '2026-03-11', '08:00 - 10:00', '18:00 - 20:00',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 175.00,
    '2026-03-11T08:30:00Z', 'Sarah Atkinson',
    '[{"id":113,"name":"Superhero Combo","sku":"BC-SUPER-CMB","quantity":1,"unitPrice":175.00,"totalPrice":175.00,"category":"Combo Castle"}]',
    '2026-03-08T12:00:00Z', '2026-03-11T18:00:00Z'
  ),
  (
    'CA-1031', '#8790', 'Jack Thompson', 'j.thompson@gmail.com', '07644 556677',
    'Delivery'::public.booking_type, 'Booking Complete'::public.booking_status,
    '3 Cedar Close', 'Coalville', 'Leicestershire', 'LE67 1CC', NULL,
    NULL, '2026-03-10', '09:00 - 11:00', '18:00 - 20:00',
    'Paid'::public.payment_status, 'Card'::public.payment_method, 155.00,
    '2026-03-10T09:30:00Z', 'Sarah Atkinson',
    '[{"id":114,"name":"Jungle Safari Castle","sku":"BC-JUNG-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"}]',
    '2026-03-07T13:00:00Z', '2026-03-10T18:00:00Z'
  ),
  (
    'CA-1030', '#8785', 'Sophie Wilson', 's.wilson@yahoo.co.uk', '07555 667788',
    'Collection'::public.booking_type, 'Booking Complete'::public.booking_status,
    'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL,
    NULL, '2026-03-09', '10:00 - 11:00', NULL,
    'Paid'::public.payment_status, 'Cash'::public.payment_method, 95.00,
    '2026-03-09T10:30:00Z', 'Sarah Atkinson',
    '[{"id":115,"name":"Classic Castle Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":95.00,"totalPrice":95.00,"category":"Bouncy Castle"}]',
    '2026-03-06T14:00:00Z', '2026-03-09T11:00:00Z'
  )
  ON CONFLICT (id) DO NOTHING;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Mock data insertion failed: %', SQLERRM;
END $$;
