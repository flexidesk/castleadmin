-- ============================================================
-- CastleAdmin MSSQL Database Setup
-- T-SQL Compatible (SQL Server 2016+)
-- Each statement is separated by GO so MSSQL processes them
-- as independent batches.
-- ============================================================

-- ─── 1. ADMIN USERS ──────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'admin_users')
BEGIN
  CREATE TABLE admin_users (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    password_salt NVARCHAR(64) NOT NULL,
    full_name NVARCHAR(255),
    role NVARCHAR(50) DEFAULT 'admin',
    is_active BIT DEFAULT 1,
    reset_token NVARCHAR(128),
    reset_token_expires_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_admin_users_email' AND object_id = OBJECT_ID('admin_users'))
  CREATE INDEX idx_admin_users_email ON admin_users(email)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_admin_users_reset_token' AND object_id = OBJECT_ID('admin_users'))
  CREATE INDEX idx_admin_users_reset_token ON admin_users(reset_token)
GO

IF NOT EXISTS (SELECT 1 FROM admin_users WHERE id = 'admin-default-001')
  INSERT INTO admin_users (id, email, password_hash, password_salt, full_name, role, is_active)
  VALUES (
    'admin-default-001',
    'admin@castleadmin.com',
    '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    'default-salt',
    'Admin User',
    'admin',
    1
  )
GO

-- ─── 2. DRIVERS ──────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'drivers')
BEGIN
  CREATE TABLE drivers (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NOT NULL,
    vehicle NVARCHAR(100) NOT NULL,
    plate NVARCHAR(20) NOT NULL,
    status NVARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available','On Route','Off Duty')),
    avatar NVARCHAR(10) NOT NULL,
    email NVARCHAR(255),
    is_active BIT NOT NULL DEFAULT 1,
    notes NVARCHAR(MAX),
    auth_user_id CHAR(36),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_drivers_status' AND object_id = OBJECT_ID('drivers'))
  CREATE INDEX idx_drivers_status ON drivers(status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_drivers_auth_user_id' AND object_id = OBJECT_ID('drivers'))
  CREATE INDEX idx_drivers_auth_user_id ON drivers(auth_user_id);

IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = 'd1000000-0000-0000-0000-000000000001')
  INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Marcus Webb', '07712 345678', 'Ford Transit', 'LN23 RKT', 'On Route', 'MW', 1);

IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = 'd1000000-0000-0000-0000-000000000002')
  INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000002', 'Priya Nair', '07845 678901', 'Mercedes Sprinter', 'BX21 VHJ', 'Available', 'PN', 1);

IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = 'd1000000-0000-0000-0000-000000000003')
  INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000003', 'Tom Bridges', '07923 112233', 'Ford Transit', 'YD22 MKL', 'On Route', 'TB', 1);

IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = 'd1000000-0000-0000-0000-000000000004')
  INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000004', 'Leanne Carter', '07600 998877', 'Vauxhall Movano', 'GX20 PPT', 'Available', 'LC', 1);

IF NOT EXISTS (SELECT 1 FROM drivers WHERE id = 'd1000000-0000-0000-0000-000000000005')
  INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
    ('d1000000-0000-0000-0000-000000000005', 'Darren Hollis', '07711 556677', 'Mercedes Sprinter', 'KE19 ZXA', 'Off Duty', 'DH', 1);

-- ─── 3. ORDERS ───────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'orders')
BEGIN
  CREATE TABLE orders (
    id NVARCHAR(20) NOT NULL PRIMARY KEY,
    woo_order_id NVARCHAR(50) NOT NULL,
    customer_name NVARCHAR(255) NOT NULL,
    customer_email NVARCHAR(255) NOT NULL,
    customer_phone NVARCHAR(50) NOT NULL,
    booking_type NVARCHAR(20) NOT NULL CHECK (booking_type IN ('Delivery','Collection')),
    status NVARCHAR(50) DEFAULT 'Booking Accepted' CHECK (status IN ('Booking Accepted','Booking Assigned','Booking Out For Delivery','Booking Complete','Booking Cancelled')),
    delivery_address_line1 NVARCHAR(255),
    delivery_address_line2 NVARCHAR(255),
    delivery_address_city NVARCHAR(100),
    delivery_address_county NVARCHAR(100),
    delivery_address_postcode NVARCHAR(20),
    delivery_address_notes NVARCHAR(MAX),
    driver_id CHAR(36),
    booking_date DATE NOT NULL,
    delivery_window NVARCHAR(50) NOT NULL,
    collection_window NVARCHAR(50),
    payment_status NVARCHAR(20) DEFAULT 'Unpaid' CHECK (payment_status IN ('Paid','Unpaid','Partial')),
    payment_method NVARCHAR(20) DEFAULT 'Unrecorded' CHECK (payment_method IN ('Card','Cash','Unrecorded')),
    payment_amount DECIMAL(10,2) DEFAULT 0,
    payment_recorded_at DATETIME2,
    payment_recorded_by NVARCHAR(255),
    payment_notes NVARCHAR(MAX),
    products NVARCHAR(MAX),
    pod NVARCHAR(MAX),
    notes NVARCHAR(MAX),
    custom_fields NVARCHAR(MAX),
    customer_rating TINYINT,
    delivery_duration_minutes INT,
    deposit_amount DECIMAL(10,2) DEFAULT 0,
    amount_due DECIMAL(10,2) DEFAULT 0,
    delivery_charge DECIMAL(10,2) DEFAULT 0,
    failure_reason NVARCHAR(MAX),
    failure_notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_booking_date' AND object_id = OBJECT_ID('orders'))
  CREATE INDEX idx_orders_booking_date ON orders(booking_date)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_status' AND object_id = OBJECT_ID('orders'))
  CREATE INDEX idx_orders_status ON orders(status)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_driver_id' AND object_id = OBJECT_ID('orders'))
  CREATE INDEX idx_orders_driver_id ON orders(driver_id)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_orders_payment_status' AND object_id = OBJECT_ID('orders'))
  CREATE INDEX idx_orders_payment_status ON orders(payment_status)
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1042')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, delivery_address_notes, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1042', '#8841', 'Rachel Thornton', 'r.thornton@outlook.com', '07831 224455', 'Delivery', 'Booking Out For Delivery', '14 Meadow Close', 'Leicester', 'Leicestershire', 'LE4 7RN', 'Side gate is unlocked. Please set up in back garden.', 'd1000000-0000-0000-0000-000000000001', '2026-03-15', '08:00 - 10:00', '18:00 - 20:00', 'Paid', 'Card', 145.00, '2026-03-10 14:22:00', 'Sarah Atkinson', '[{"id":101,"name":"Frozen Elsa Castle - Large","sku":"BC-ELSA-LG","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"}]', '2026-03-10 14:20:00', '2026-03-15 08:47:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1041')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, delivery_address_notes, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, products, created_at, updated_at) VALUES
  ('CA-1041', '#8839', 'James Okafor', 'j.okafor@gmail.com', '07900 334455', 'Delivery', 'Booking Assigned', '7 Birchwood Avenue', 'Leicester', 'Leicestershire', 'LE2 5GH', NULL, 'd1000000-0000-0000-0000-000000000003', '2026-03-15', '10:00 - 12:00', '19:00 - 21:00', 'Unpaid', 'Cash', 175.00, '[{"id":103,"name":"Superhero Combo Castle","sku":"BC-SUPER-CMB","quantity":1,"unitPrice":175.00,"totalPrice":175.00,"category":"Combo Castle"}]', '2026-03-11 09:10:00', '2026-03-14 16:05:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1040')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, products, created_at, updated_at) VALUES
  ('CA-1040', '#8836', 'Sonia Patel', 'sonia.patel@hotmail.co.uk', '07724 889900', 'Delivery', 'Booking Accepted', '3 Rosewood Drive', 'Loughborough', 'Leicestershire', 'LE11 3PQ', NULL, '2026-03-15', '12:00 - 14:00', '20:00 - 22:00', 'Unpaid', 'Unrecorded', 130.00, '[{"id":104,"name":"Princess Palace Castle - Medium","sku":"BC-PRIN-MD","quantity":1,"unitPrice":130.00,"totalPrice":130.00,"category":"Bouncy Castle"}]', '2026-03-12 11:30:00', '2026-03-12 11:30:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1039')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1039', '#8830', 'Daniel Hughes', 'd.hughes@company.co.uk', '07811 667788', 'Delivery', 'Booking Out For Delivery', '22 Oak Lane', 'Hinckley', 'Leicestershire', 'LE10 0AB', 'd1000000-0000-0000-0000-000000000003', '2026-03-15', '09:00 - 11:00', '18:30 - 20:30', 'Paid', 'Card', 185.00, '2026-03-09 10:00:00', 'Sarah Atkinson', '[{"id":105,"name":"Jungle Safari Castle","sku":"BC-JUNG-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"},{"id":106,"name":"Safety Crash Mat Set","sku":"ACC-MAT-SET","quantity":2,"unitPrice":15.00,"totalPrice":30.00,"category":"Accessory"}]', '2026-03-09 09:55:00', '2026-03-15 09:15:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1038')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1038', '#8825', 'Natalie Frost', 'nat.frost@gmail.com', '07955 443322', 'Collection', 'Booking Complete', 'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL, '2026-03-14', '10:00 - 11:00', 'Paid', 'Cash', 95.00, '2026-03-14 10:45:00', 'Sarah Atkinson', '[{"id":107,"name":"Classic Red & Blue Castle - Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":95.00,"totalPrice":95.00,"category":"Bouncy Castle"}]', '2026-03-08 15:00:00', '2026-03-14 10:44:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1037')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1037', '#8820', 'Connor Gallagher', 'cgallagher@live.co.uk', '07700 112233', 'Delivery', 'Booking Complete', '9 Willow Street', 'Coalville', 'Leicestershire', 'LE67 3BT', NULL, '2026-03-14', '08:30 - 10:30', '19:00 - 21:00', 'Paid', 'Card', 165.00, '2026-03-13 17:00:00', 'Sarah Atkinson', '[{"id":108,"name":"Dinosaur Dino World Castle","sku":"BC-DINO-LG","quantity":1,"unitPrice":165.00,"totalPrice":165.00,"category":"Bouncy Castle"}]', '2026-03-07 10:00:00', '2026-03-14 09:06:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1036')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, products, created_at, updated_at) VALUES
  ('CA-1036', '#8815', 'Amelia Rhodes', 'amelia.rhodes@yahoo.co.uk', '07888 776655', 'Delivery', 'Booking Accepted', '51 Granby Street', 'Melton Mowbray', 'Leicestershire', 'LE13 1JZ', NULL, '2026-03-16', '09:00 - 11:00', '19:00 - 21:00', 'Unpaid', 'Cash', 155.00, '[{"id":109,"name":"Pirate Ship Castle","sku":"BC-PIR-MD","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"}]', '2026-03-13 14:00:00', '2026-03-13 14:00:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1035')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, payment_status, payment_method, payment_amount, products, created_at, updated_at) VALUES
  ('CA-1035', '#8810', 'Ben Whitfield', 'benw@btinternet.com', '07744 998877', 'Collection', 'Booking Assigned', 'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', 'd1000000-0000-0000-0000-000000000002', '2026-03-16', '11:00 - 12:00', 'Unpaid', 'Card', 195.00, '[{"id":110,"name":"Football Pitch Inflatable","sku":"BC-FOOT-LG","quantity":1,"unitPrice":195.00,"totalPrice":195.00,"category":"Inflatable"}]', '2026-03-14 08:30:00', '2026-03-14 08:30:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1034')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1034', '#8805', 'Lucy Hargreaves', 'lucy.h@gmail.com', '07811 223344', 'Delivery', 'Booking Complete', '12 Park Road', 'Leicester', 'Leicestershire', 'LE1 2AB', NULL, '2026-03-13', '09:00 - 11:00', '18:00 - 20:00', 'Paid', 'Card', 120.00, '2026-03-13 09:30:00', 'Sarah Atkinson', '[{"id":111,"name":"Classic Castle Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":120.00,"totalPrice":120.00,"category":"Bouncy Castle"}]', '2026-03-10 10:00:00', '2026-03-13 18:00:00')
GO

IF NOT EXISTS (SELECT 1 FROM orders WHERE id = 'CA-1033')
  INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
  ('CA-1033', '#8800', 'Oliver Marsh', 'o.marsh@outlook.com', '07922 334455', 'Delivery', 'Booking Complete', '5 High Street', 'Loughborough', 'Leicestershire', 'LE11 1AA', NULL, '2026-03-12', '10:00 - 12:00', '19:00 - 21:00', 'Paid', 'Cash', 145.00, '2026-03-12 10:30:00', 'Sarah Atkinson', '[{"id":112,"name":"Pirate Ship Castle","sku":"BC-PIR-MD","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"}]', '2026-03-09 11:00:00', '2026-03-12 19:00:00')
GO

-- ─── 4. VEHICLES ─────────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'vehicles')
BEGIN
  CREATE TABLE vehicles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    registration NVARCHAR(20) NOT NULL UNIQUE,
    make NVARCHAR(100) NOT NULL,
    model NVARCHAR(100) NOT NULL,
    year INT,
    colour NVARCHAR(50),
    type NVARCHAR(50) NOT NULL DEFAULT 'Van',
    is_active BIT NOT NULL DEFAULT 1,
    assigned_driver_id CHAR(36),
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_vehicles_assigned_driver' AND object_id = OBJECT_ID('vehicles'))
  CREATE INDEX idx_vehicles_assigned_driver ON vehicles(assigned_driver_id);

IF NOT EXISTS (SELECT 1 FROM vehicles WHERE registration = 'LN23 RKT')
  INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES (NEWID(), 'LN23 RKT', 'Ford', 'Transit', 2023, 'White', 'Van', 'd1000000-0000-0000-0000-000000000001');

IF NOT EXISTS (SELECT 1 FROM vehicles WHERE registration = 'BX21 VHJ')
  INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES (NEWID(), 'BX21 VHJ', 'Mercedes', 'Sprinter', 2021, 'Silver', 'Van', 'd1000000-0000-0000-0000-000000000002');

IF NOT EXISTS (SELECT 1 FROM vehicles WHERE registration = 'YD22 MKL')
  INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES (NEWID(), 'YD22 MKL', 'Ford', 'Transit', 2022, 'White', 'Van', 'd1000000-0000-0000-0000-000000000003');

IF NOT EXISTS (SELECT 1 FROM vehicles WHERE registration = 'GX20 PPT')
  INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES (NEWID(), 'GX20 PPT', 'Vauxhall', 'Movano', 2020, 'Grey', 'Large Van', 'd1000000-0000-0000-0000-000000000004');

IF NOT EXISTS (SELECT 1 FROM vehicles WHERE registration = 'KE19 ZXA')
  INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES (NEWID(), 'KE19 ZXA', 'Mercedes', 'Sprinter', 2019, 'White', 'Van', 'd1000000-0000-0000-0000-000000000005');

-- ─── 5. DRIVER PORTAL CREDENTIALS ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_portal_credentials')
BEGIN
  CREATE TABLE driver_portal_credentials (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL UNIQUE,
    username NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    is_active BIT DEFAULT 1,
    last_login_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_portal_creds_username' AND object_id = OBJECT_ID('driver_portal_credentials'))
  CREATE INDEX idx_driver_portal_creds_username ON driver_portal_credentials(username);

-- ─── 6. DRIVER LOCATIONS ─────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_locations')
BEGIN
  CREATE TABLE driver_locations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    accuracy DECIMAL(10,2),
    heading DECIMAL(5,2),
    speed DECIMAL(8,2),
    recorded_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_locations_driver_id' AND object_id = OBJECT_ID('driver_locations'))
  CREATE INDEX idx_driver_locations_driver_id ON driver_locations(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_locations_recorded_at' AND object_id = OBJECT_ID('driver_locations'))
  CREATE INDEX idx_driver_locations_recorded_at ON driver_locations(recorded_at);

-- ─── 7. DRIVER PERFORMANCE LOGS ──────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_performance_logs')
BEGIN
  CREATE TABLE driver_performance_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    order_id NVARCHAR(20),
    delivery_date DATE NOT NULL,
    was_successful BIT NOT NULL DEFAULT 1,
    duration_minutes INT,
    customer_rating TINYINT,
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_perf_driver_id' AND object_id = OBJECT_ID('driver_performance_logs'))
  CREATE INDEX idx_driver_perf_driver_id ON driver_performance_logs(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_perf_delivery_date' AND object_id = OBJECT_ID('driver_performance_logs'))
  CREATE INDEX idx_driver_perf_delivery_date ON driver_performance_logs(delivery_date);

INSERT INTO driver_performance_logs (id, driver_id, delivery_date, was_successful, duration_minutes, customer_rating) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', CAST(DATEADD(DAY, -1, GETDATE()) AS DATE), 1, 45, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', CAST(DATEADD(DAY, -2, GETDATE()) AS DATE), 1, 60, 4),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', CAST(DATEADD(DAY, -3, GETDATE()) AS DATE), 1, 55, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', CAST(DATEADD(DAY, -5, GETDATE()) AS DATE), 0, 90, 2),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', CAST(DATEADD(DAY, -7, GETDATE()) AS DATE), 1, 40, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', CAST(DATEADD(DAY, -1, GETDATE()) AS DATE), 1, 50, 4),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', CAST(DATEADD(DAY, -2, GETDATE()) AS DATE), 1, 65, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', CAST(DATEADD(DAY, -4, GETDATE()) AS DATE), 1, 35, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', CAST(DATEADD(DAY, -6, GETDATE()) AS DATE), 0, 80, 1),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', CAST(DATEADD(DAY, -1, GETDATE()) AS DATE), 1, 70, 4),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', CAST(DATEADD(DAY, -3, GETDATE()) AS DATE), 1, 45, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', CAST(DATEADD(DAY, -5, GETDATE()) AS DATE), 1, 55, 4),
  (NEWID(), 'd1000000-0000-0000-0000-000000000004', CAST(DATEADD(DAY, -2, GETDATE()) AS DATE), 1, 60, 5),
  (NEWID(), 'd1000000-0000-0000-0000-000000000004', CAST(DATEADD(DAY, -4, GETDATE()) AS DATE), 0, 95, 2),
  (NEWID(), 'd1000000-0000-0000-0000-000000000005', CAST(DATEADD(DAY, -3, GETDATE()) AS DATE), 1, 50, 4);

-- ─── 8. DRIVER EARNINGS ──────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_earnings')
BEGIN
  CREATE TABLE driver_earnings (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    order_id NVARCHAR(20),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    type NVARCHAR(20) NOT NULL DEFAULT 'delivery' CHECK (type IN ('delivery','bonus','deduction')),
    notes NVARCHAR(MAX),
    earned_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_earnings_driver_id' AND object_id = OBJECT_ID('driver_earnings'))
  CREATE INDEX idx_driver_earnings_driver_id ON driver_earnings(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_earnings_earned_at' AND object_id = OBJECT_ID('driver_earnings'))
  CREATE INDEX idx_driver_earnings_earned_at ON driver_earnings(earned_at);

INSERT INTO driver_earnings (id, driver_id, order_id, amount, type, earned_at) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1042', 18.50, 'delivery', '2026-03-15 10:00:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1039', 22.00, 'delivery', '2026-03-15 11:30:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', NULL,       15.00, 'bonus',    '2026-03-14 17:00:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', 'CA-1035', 20.00, 'delivery', '2026-03-16 12:00:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1041', 19.50, 'delivery', '2026-03-15 12:30:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1039', 22.00, 'delivery', '2026-03-15 11:00:00');

-- ─── 9. DRIVER CASH ALLOCATIONS ──────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_cash_allocations')
BEGIN
  CREATE TABLE driver_cash_allocations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    order_id NVARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    allocated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_cash_alloc_driver' AND object_id = OBJECT_ID('driver_cash_allocations'))
  CREATE INDEX idx_driver_cash_alloc_driver ON driver_cash_allocations(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_cash_alloc_order' AND object_id = OBJECT_ID('driver_cash_allocations'))
  CREATE INDEX idx_driver_cash_alloc_order ON driver_cash_allocations(order_id);

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_cash_collections')
BEGIN
  CREATE TABLE driver_cash_collections (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    collected_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    collected_by NVARCHAR(255) NOT NULL DEFAULT 'Admin',
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_cash_coll_driver' AND object_id = OBJECT_ID('driver_cash_collections'))
  CREATE INDEX idx_driver_cash_coll_driver ON driver_cash_collections(driver_id);

INSERT INTO driver_cash_allocations (id, driver_id, order_id, amount, allocated_at) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1041', 175.00, '2026-03-15 12:30:00'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1038', 95.00,  '2026-03-14 11:00:00');

INSERT INTO driver_cash_collections (id, driver_id, amount, collected_at, collected_by) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 175.00, '2026-03-16 09:00:00', 'Admin'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 95.00,  '2026-03-15 09:00:00', 'Admin');

-- ─── 10. DRIVER SHIFT TEMPLATES ──────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_shift_templates')
BEGIN
  CREATE TABLE driver_shift_templates (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    day_of_week TINYINT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    pay_rate DECIMAL(10,2),
    pay_rate_type NVARCHAR(20) DEFAULT 'hourly' CHECK (pay_rate_type IN ('hourly','fixed','per_delivery')),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_shift_templates_driver' AND object_id = OBJECT_ID('driver_shift_templates'))
  CREATE INDEX idx_shift_templates_driver ON driver_shift_templates(driver_id);

INSERT INTO driver_shift_templates (id, driver_id, day_of_week, start_time, end_time, pay_rate, pay_rate_type) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 1, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 2, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 3, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', 1, '09:00:00', '18:00:00', 13.00, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', 3, '09:00:00', '18:00:00', 13.00, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', 5, '09:00:00', '14:00:00', 13.00, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 2, '07:00:00', '16:00:00', 12.00, 'hourly'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 4, '07:00:00', '16:00:00', 12.00, 'hourly');

-- ─── 11. DRIVER INSPECTION SCHEDULES ─────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_inspection_schedules')
BEGIN
  CREATE TABLE driver_inspection_schedules (
    id CHAR(36) NOT NULL PRIMARY KEY,
    vehicle_id CHAR(36),
    driver_id CHAR(36),
    inspection_type NVARCHAR(100) NOT NULL DEFAULT 'routine',
    scheduled_date DATE NOT NULL,
    completed_at DATETIME2,
    status NVARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','overdue','cancelled')),
    notes NVARCHAR(MAX),
    is_recurring BIT DEFAULT 0,
    recurrence_interval_days INT,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_inspection_driver' AND object_id = OBJECT_ID('driver_inspection_schedules'))
  CREATE INDEX idx_inspection_driver ON driver_inspection_schedules(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_inspection_date' AND object_id = OBJECT_ID('driver_inspection_schedules'))
  CREATE INDEX idx_inspection_date ON driver_inspection_schedules(scheduled_date);

INSERT INTO driver_inspection_schedules (id, driver_id, inspection_type, scheduled_date, status) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000001', 'routine',    CAST(DATEADD(DAY,  7, GETDATE()) AS DATE), 'scheduled'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000002', 'routine',    CAST(DATEADD(DAY, 14, GETDATE()) AS DATE), 'scheduled'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000003', 'safety',     CAST(DATEADD(DAY, -2, GETDATE()) AS DATE), 'overdue'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000004', 'routine',    CAST(DATEADD(DAY,  3, GETDATE()) AS DATE), 'scheduled'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000005', 'full_check', CAST(DATEADD(DAY, -5, GETDATE()) AS DATE), 'overdue');

-- ─── 12. DRIVER POD SUBMISSIONS ──────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'driver_pod_submissions')
BEGIN
  CREATE TABLE driver_pod_submissions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    order_id NVARCHAR(20) NOT NULL,
    driver_id CHAR(36) NOT NULL,
    signed_by NVARCHAR(255) NOT NULL,
    signature_data_url NVARCHAR(MAX),
    notes NVARCHAR(MAX),
    photos NVARCHAR(MAX),
    submitted_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_pod_order_id' AND object_id = OBJECT_ID('driver_pod_submissions'))
  CREATE INDEX idx_driver_pod_order_id ON driver_pod_submissions(order_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_driver_pod_driver_id' AND object_id = OBJECT_ID('driver_pod_submissions'))
  CREATE INDEX idx_driver_pod_driver_id ON driver_pod_submissions(driver_id);

-- ─── 13. FLEET CONFIG ────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'fleet_config')
BEGIN
  CREATE TABLE fleet_config (
    id CHAR(36) NOT NULL PRIMARY KEY,
    company_name NVARCHAR(255) NOT NULL DEFAULT 'CastleAdmin Fleet',
    timezone NVARCHAR(100) NOT NULL DEFAULT 'Europe/London',
    currency NVARCHAR(10) NOT NULL DEFAULT 'GBP',
    base_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    per_km_fee DECIMAL(10,2) NOT NULL DEFAULT 0.50,
    min_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 3.00,
    max_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    fee_structure NVARCHAR(50) NOT NULL DEFAULT 'flat',
    delivery_fee_enabled BIT NOT NULL DEFAULT 0,
    auto_zone_allocation BIT NOT NULL DEFAULT 0,
    company_address NVARCHAR(MAX),
    company_phone NVARCHAR(50),
    company_email NVARCHAR(255),
    map_default_postcode NVARCHAR(20),
    map_default_lat DECIMAL(10,8),
    map_default_lng DECIMAL(11,8),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM fleet_config)
  INSERT INTO fleet_config (id, company_name, timezone, currency, base_delivery_fee, per_km_fee, min_delivery_fee, max_delivery_fee, fee_structure, company_address, company_phone, company_email)
  VALUES (NEWID(), 'CastleAdmin Fleet', 'Europe/London', 'GBP', 5.00, 0.50, 3.00, 50.00, 'flat', '123 Fleet Street, London, EC4A 2BB', '+44 20 7946 0958', 'admin@castlefleet.co.uk');

-- ─── 14. NOTIFICATION PREFERENCES ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'notification_preferences')
BEGIN
  CREATE TABLE notification_preferences (
    id CHAR(36) NOT NULL PRIMARY KEY,
    notify_new_order BIT NOT NULL DEFAULT 1,
    notify_order_status_change BIT NOT NULL DEFAULT 1,
    notify_driver_assigned BIT NOT NULL DEFAULT 1,
    notify_delivery_complete BIT NOT NULL DEFAULT 1,
    notify_delivery_failed BIT NOT NULL DEFAULT 1,
    notify_driver_offline BIT NOT NULL DEFAULT 0,
    notify_low_driver_availability BIT NOT NULL DEFAULT 1,
    email_notifications BIT NOT NULL DEFAULT 1,
    sms_notifications BIT NOT NULL DEFAULT 0,
    push_notifications BIT NOT NULL DEFAULT 1,
    notification_email NVARCHAR(255),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM notification_preferences)
  INSERT INTO notification_preferences (id, notification_email)
  VALUES (NEWID(), 'admin@castlefleet.co.uk');

-- ─── 15. USER ROLES ──────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'user_roles')
BEGIN
  CREATE TABLE user_roles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id CHAR(36),
    email NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(255) NOT NULL DEFAULT '',
    role NVARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','manager','dispatcher','viewer')),
    is_active BIT NOT NULL DEFAULT 1,
    can_create_orders BIT NOT NULL DEFAULT 0,
    can_edit_orders BIT NOT NULL DEFAULT 0,
    can_delete_orders BIT NOT NULL DEFAULT 0,
    can_manage_drivers BIT NOT NULL DEFAULT 0,
    can_view_analytics BIT NOT NULL DEFAULT 0,
    can_manage_settings BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_user_roles_email' AND object_id = OBJECT_ID('user_roles'))
  CREATE INDEX idx_user_roles_email ON user_roles(email);

IF NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'admin@castlefleet.co.uk')
  INSERT INTO user_roles (id, email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
    (NEWID(), 'admin@castlefleet.co.uk',      'System Admin',         'admin',      1, 1, 1, 1, 1, 1, 1);

IF NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'manager@castlefleet.co.uk')
  INSERT INTO user_roles (id, email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
    (NEWID(), 'manager@castlefleet.co.uk',    'Operations Manager',   'manager',    1, 1, 1, 0, 1, 1, 0);

IF NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'dispatcher@castlefleet.co.uk')
  INSERT INTO user_roles (id, email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
    (NEWID(), 'dispatcher@castlefleet.co.uk', 'Dispatch Controller',  'dispatcher', 1, 1, 1, 0, 0, 0, 0);

IF NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'viewer@castlefleet.co.uk')
  INSERT INTO user_roles (id, email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
    (NEWID(), 'viewer@castlefleet.co.uk',     'Read-Only User',       'viewer',     1, 0, 0, 0, 0, 1, 0);

-- ─── 16. SYSTEM INTEGRATIONS ─────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'system_integrations')
BEGIN
  CREATE TABLE system_integrations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(MAX),
    is_enabled BIT NOT NULL DEFAULT 0,
    api_key NVARCHAR(MAX),
    api_secret NVARCHAR(MAX),
    webhook_url NVARCHAR(MAX),
    config NVARCHAR(MAX),
    last_synced_at DATETIME2,
    status NVARCHAR(50) NOT NULL DEFAULT 'disconnected',
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_system_integrations_slug' AND object_id = OBJECT_ID('system_integrations'))
  CREATE INDEX idx_system_integrations_slug ON system_integrations(slug);

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'woocommerce')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'WooCommerce', 'woocommerce', 'Sync orders from WooCommerce store', 1, 'connected');

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'google-maps')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'Google Maps', 'google-maps', 'Route optimisation and geocoding', 0, 'disconnected');

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'stripe')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'Stripe', 'stripe', 'Payment processing and invoicing', 0, 'disconnected');

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'twilio')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'Twilio SMS', 'twilio', 'SMS notifications to customers and drivers', 0, 'disconnected');

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'sendgrid')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'SendGrid', 'sendgrid', 'Transactional email delivery', 0, 'disconnected');

IF NOT EXISTS (SELECT 1 FROM system_integrations WHERE slug = 'slack')
  INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES (NEWID(), 'Slack', 'slack', 'Team notifications and alerts', 0, 'disconnected');

-- ─── 17. WOOCOMMERCE SETTINGS ────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woocommerce_settings')
BEGIN
  CREATE TABLE woocommerce_settings (
    id CHAR(36) NOT NULL PRIMARY KEY,
    store_url NVARCHAR(MAX) NOT NULL,
    consumer_key NVARCHAR(MAX) NOT NULL,
    consumer_secret NVARCHAR(MAX) NOT NULL,
    is_connected BIT NOT NULL DEFAULT 0,
    is_enabled BIT NOT NULL DEFAULT 0,
    last_tested_at DATETIME2,
    last_test_status NVARCHAR(50),
    last_test_message NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM woocommerce_settings)
  INSERT INTO woocommerce_settings (id, store_url, consumer_key, consumer_secret, is_connected)
  VALUES (NEWID(), '', '', '', 0);

-- ─── 18. WOOCOMMERCE FIELD MAPPING ───────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woocommerce_field_mapping')
BEGIN
  CREATE TABLE woocommerce_field_mapping (
    id CHAR(36) NOT NULL PRIMARY KEY,
    woo_field NVARCHAR(255) NOT NULL,
    local_field NVARCHAR(255) NOT NULL,
    transform NVARCHAR(100),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

-- ─── 19. WOOCOMMERCE SYNC LOG ────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woocommerce_sync_log')
BEGIN
  CREATE TABLE woocommerce_sync_log (
    id CHAR(36) NOT NULL PRIMARY KEY,
    sync_type NVARCHAR(50) NOT NULL DEFAULT 'manual',
    orders_synced INT NOT NULL DEFAULT 0,
    orders_created INT NOT NULL DEFAULT 0,
    orders_updated INT NOT NULL DEFAULT 0,
    orders_failed INT NOT NULL DEFAULT 0,
    error_message NVARCHAR(MAX),
    started_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    completed_at DATETIME2,
    status NVARCHAR(50) NOT NULL DEFAULT 'running'
  )
END;

-- ─── 20. WOOCOMMERCE WEBHOOK LOG ─────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'woocommerce_webhook_log')
BEGIN
  CREATE TABLE woocommerce_webhook_log (
    id CHAR(36) NOT NULL PRIMARY KEY,
    event_type NVARCHAR(100) NOT NULL,
    woo_order_id NVARCHAR(50),
    payload NVARCHAR(MAX),
    status NVARCHAR(50) NOT NULL DEFAULT 'received',
    error_message NVARCHAR(MAX),
    processed_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

-- ─── 21. WEBHOOK EVENT LOGS ──────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'webhook_event_logs')
BEGIN
  CREATE TABLE webhook_event_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    event_type NVARCHAR(100) NOT NULL,
    source NVARCHAR(100),
    payload NVARCHAR(MAX),
    status NVARCHAR(50) NOT NULL DEFAULT 'received',
    error_message NVARCHAR(MAX),
    order_id NVARCHAR(20),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_webhook_event_logs_event' AND object_id = OBJECT_ID('webhook_event_logs'))
  CREATE INDEX idx_webhook_event_logs_event ON webhook_event_logs(event_type);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_webhook_event_logs_created' AND object_id = OBJECT_ID('webhook_event_logs'))
  CREATE INDEX idx_webhook_event_logs_created ON webhook_event_logs(created_at);

-- ─── 22. WEBHOOK CONFIGS ─────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'webhook_configs')
BEGIN
  CREATE TABLE webhook_configs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    url NVARCHAR(MAX) NOT NULL,
    events NVARCHAR(MAX),
    secret NVARCHAR(255),
    is_active BIT NOT NULL DEFAULT 1,
    last_triggered_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

-- ─── 23. WEBHOOK REQUEST LOGS ────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'webhook_request_logs')
BEGIN
  CREATE TABLE webhook_request_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    webhook_config_id CHAR(36),
    event_type NVARCHAR(100),
    url NVARCHAR(MAX),
    request_payload NVARCHAR(MAX),
    response_status INT,
    response_body NVARCHAR(MAX),
    duration_ms INT,
    status NVARCHAR(50) NOT NULL DEFAULT 'success',
    error_message NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

-- ─── 24. MESSAGE TEMPLATES ───────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'message_templates')
BEGIN
  CREATE TABLE message_templates (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    channel NVARCHAR(10) NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
    trigger_type NVARCHAR(50) NOT NULL DEFAULT 'custom' CHECK (trigger_type IN ('new_assignment','delivery_failure','payment_issue','daily_summary','booking_accepted','booking_assigned','booking_out_for_delivery','booking_complete','custom')),
    subject NVARCHAR(500),
    body NVARCHAR(MAX) NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    is_admin_alert BIT NOT NULL DEFAULT 0,
    description NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_message_templates_channel' AND object_id = OBJECT_ID('message_templates'))
  CREATE INDEX idx_message_templates_channel ON message_templates(channel);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_message_templates_trigger' AND object_id = OBJECT_ID('message_templates'))
  CREATE INDEX idx_message_templates_trigger ON message_templates(trigger_type);

INSERT INTO message_templates (id, name, channel, trigger_type, subject, body, is_active, is_admin_alert, description) VALUES
  (NEWID(), 'New Assignment Alert',          'email', 'new_assignment',           'New Booking Assigned - {{order_id}}',          '<p>Hi {{customer_name}},</p><p>Your booking has been accepted.</p><p><strong>Order ID:</strong> {{order_id}}</p>', 1, 0, 'Sent to customer when their booking is accepted'),
  (NEWID(), 'Delivery Failure Alert',        'email', 'delivery_failure',         'Delivery Failed - {{order_id}}',               '<p>Hi {{customer_name}},</p><p>Your order {{order_id}} has been cancelled due to delivery failure.</p>', 1, 0, 'Sent to customer when their delivery fails'),
  (NEWID(), 'Booking Accepted - Customer',   'email', 'booking_accepted',         'Your Booking Has Been Accepted - {{order_id}}', '<p>Hi {{customer_name}},</p><p>Your booking has been accepted.</p><p><strong>Order ID:</strong> {{order_id}}</p>', 1, 0, 'Sent to customer when their booking is accepted'),
  (NEWID(), 'Out For Delivery - Customer SMS','sms',   'booking_out_for_delivery', NULL,                                           'Hi {{customer_name}}, your order {{order_id}} is out for delivery! Track it here: {{tracking_link}}', 1, 0, 'SMS sent to customer when their order is out for delivery'),
  (NEWID(), 'Delivery Complete - Customer',  'email', 'booking_complete',         'Your Delivery Is Complete - {{order_id}}',     '<p>Hi {{customer_name}},</p><p>Your order has been successfully delivered!</p><p><strong>Order ID:</strong> {{order_id}}</p>', 1, 0, 'Sent to customer when their delivery is complete');

-- ─── 25. EMAIL ALERT LOGS ────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'email_alert_logs')
BEGIN
  CREATE TABLE email_alert_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    template_id CHAR(36),
    trigger_type NVARCHAR(50) NOT NULL CHECK (trigger_type IN ('new_assignment','delivery_failure','payment_issue','daily_summary','booking_accepted','booking_assigned','booking_out_for_delivery','booking_complete','custom')),
    channel NVARCHAR(10) NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
    recipient NVARCHAR(255) NOT NULL,
    subject NVARCHAR(500),
    status NVARCHAR(50) NOT NULL DEFAULT 'sent',
    error_message NVARCHAR(MAX),
    order_id NVARCHAR(20),
    metadata NVARCHAR(MAX),
    sent_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_email_alert_logs_trigger' AND object_id = OBJECT_ID('email_alert_logs'))
  CREATE INDEX idx_email_alert_logs_trigger ON email_alert_logs(trigger_type);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_email_alert_logs_sent_at' AND object_id = OBJECT_ID('email_alert_logs'))
  CREATE INDEX idx_email_alert_logs_sent_at ON email_alert_logs(sent_at);

-- ─── 26. SMS ALERT LOGS ──────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sms_alert_logs')
BEGIN
  CREATE TABLE sms_alert_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    order_id NVARCHAR(20),
    recipient_phone NVARCHAR(50) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(50) NOT NULL DEFAULT 'sent',
    provider NVARCHAR(50) DEFAULT 'twilio',
    provider_message_id NVARCHAR(255),
    error_message NVARCHAR(MAX),
    sent_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sms_alert_logs_order' AND object_id = OBJECT_ID('sms_alert_logs'))
  CREATE INDEX idx_sms_alert_logs_order ON sms_alert_logs(order_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_sms_alert_logs_sent_at' AND object_id = OBJECT_ID('sms_alert_logs'))
  CREATE INDEX idx_sms_alert_logs_sent_at ON sms_alert_logs(sent_at);

-- ─── 27. PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'push_subscriptions')
BEGIN
  CREATE TABLE push_subscriptions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    endpoint NVARCHAR(MAX) NOT NULL,
    p256dh NVARCHAR(MAX),
    auth NVARCHAR(MAX),
    user_agent NVARCHAR(MAX),
    driver_id CHAR(36),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

-- ─── 28. NOTIFICATIONS ───────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'notifications')
BEGIN
  CREATE TABLE notifications (
    id CHAR(36) NOT NULL PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    type NVARCHAR(50) NOT NULL DEFAULT 'info',
    is_read BIT NOT NULL DEFAULT 0,
    order_id NVARCHAR(20),
    driver_id CHAR(36),
    metadata NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_notifications_is_read' AND object_id = OBJECT_ID('notifications'))
  CREATE INDEX idx_notifications_is_read ON notifications(is_read);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_notifications_created_at' AND object_id = OBJECT_ID('notifications'))
  CREATE INDEX idx_notifications_created_at ON notifications(created_at);

INSERT INTO notifications (id, title, message, type, is_read, order_id) VALUES
  (NEWID(), 'New Order Received',  'Order CA-1042 has been placed by Rachel Thornton',  'order',      0, 'CA-1042'),
  (NEWID(), 'Driver Assigned',     'Marcus Webb has been assigned to order CA-1042',    'assignment', 0, 'CA-1042'),
  (NEWID(), 'Delivery Complete',   'Order CA-1038 has been delivered successfully',     'success',    1, 'CA-1038'),
  (NEWID(), 'Payment Received',    'Payment of £145.00 recorded for order CA-1042',    'payment',    1, 'CA-1042');

-- ─── 29. DELIVERY ZONES ──────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'delivery_zones')
BEGIN
  CREATE TABLE delivery_zones (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    color NVARCHAR(20) NOT NULL DEFAULT '#6366f1',
    polygon_geojson NVARCHAR(MAX) NOT NULL,
    driver_id CHAR(36),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_delivery_zones_driver' AND object_id = OBJECT_ID('delivery_zones'))
  CREATE INDEX idx_delivery_zones_driver ON delivery_zones(driver_id);

INSERT INTO delivery_zones (id, name, description, color, polygon_geojson, driver_id, is_active) VALUES
  (NEWID(), 'North Zone',   'North Leicester & Loughborough area', '#3b82f6', '{"type":"Polygon","coordinates":[[[-1.15,52.68],[-1.05,52.68],[-1.05,52.75],[-1.15,52.75],[-1.15,52.68]]]}', 'd1000000-0000-0000-0000-000000000001', 1),
  (NEWID(), 'South Zone',   'South Leicester & Hinckley area',     '#22c55e', '{"type":"Polygon","coordinates":[[[-1.18,52.58],[-1.08,52.58],[-1.08,52.63],[-1.18,52.63],[-1.18,52.58]]]}', 'd1000000-0000-0000-0000-000000000002', 1),
  (NEWID(), 'Central Zone', 'City centre & LE1-LE5 postcodes',     '#ec4899', '{"type":"Polygon","coordinates":[[[-1.14,52.62],[-1.10,52.62],[-1.10,52.65],[-1.14,52.65],[-1.14,52.62]]]}', 'd1000000-0000-0000-0000-000000000003', 1);

-- ─── 30. CUSTOMERS ───────────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'customers')
BEGIN
  CREATE TABLE customers (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255),
    phone NVARCHAR(50) NOT NULL,
    address NVARCHAR(MAX),
    notes NVARCHAR(MAX),
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_email' AND object_id = OBJECT_ID('customers'))
  CREATE INDEX idx_customers_email ON customers(email);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_customers_phone' AND object_id = OBJECT_ID('customers'))
  CREATE INDEX idx_customers_phone ON customers(phone);

INSERT INTO customers (id, name, email, phone, address, notes, is_active) VALUES
  (NEWID(), 'Rachel Thornton',  'r.thornton@outlook.com',    '07831 224455', '14 Meadow Close, Leicester, LE4 7RN',       'Prefers morning deliveries', 1),
  (NEWID(), 'James Okafor',     'j.okafor@gmail.com',        '07900 334455', '7 Birchwood Avenue, Leicester, LE2 5GH',     NULL, 1),
  (NEWID(), 'Sonia Patel',      'sonia.patel@hotmail.co.uk', '07724 889900', '3 Rosewood Drive, Loughborough, LE11 3PQ',  NULL, 1),
  (NEWID(), 'Daniel Hughes',    'd.hughes@company.co.uk',    '07811 667788', '22 Oak Lane, Hinckley, LE10 0AB',            'Business account', 1),
  (NEWID(), 'Natalie Frost',    'nat.frost@gmail.com',       '07955 443322', 'Unit 4, Castle Depot, Leicester, LE19 1WW',  NULL, 1),
  (NEWID(), 'Connor Gallagher', 'cgallagher@live.co.uk',     '07700 112233', '9 Willow Street, Coalville, LE67 3BT',       NULL, 1),
  (NEWID(), 'Amelia Rhodes',    'amelia.rhodes@yahoo.co.uk', '07888 776655', '51 Granby Street, Melton Mowbray, LE13 1JZ', NULL, 1),
  (NEWID(), 'Ben Whitfield',    'benw@btinternet.com',       '07744 998877', 'Unit 4, Castle Depot, Leicester, LE19 1WW',  NULL, 1);

-- ─── 31. ACTIVITY LOGS ───────────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'activity_logs')
BEGIN
  CREATE TABLE activity_logs (
    id CHAR(36) NOT NULL PRIMARY KEY,
    action NVARCHAR(255) NOT NULL,
    entity_type NVARCHAR(100),
    entity_id NVARCHAR(100),
    user_email NVARCHAR(255),
    details NVARCHAR(MAX),
    ip_address NVARCHAR(50),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_activity_logs_entity' AND object_id = OBJECT_ID('activity_logs'))
  CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_activity_logs_created' AND object_id = OBJECT_ID('activity_logs'))
  CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);

INSERT INTO activity_logs (id, action, entity_type, entity_id, user_email, details) VALUES
  (NEWID(), 'order.created',    'order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","customer":"Rachel Thornton"}'),
  (NEWID(), 'driver.assigned',  'order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","driver":"Marcus Webb"}'),
  (NEWID(), 'payment.recorded', 'order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","amount":145.00,"method":"Card"}'),
  (NEWID(), 'order.completed',  'order',  'CA-1038', 'admin@castlefleet.co.uk', '{"order_id":"CA-1038","customer":"Natalie Frost"}'),
  (NEWID(), 'driver.created',   'driver', 'd1000000-0000-0000-0000-000000000001', 'admin@castlefleet.co.uk', '{"driver":"Marcus Webb"}');

-- ─── 32. STAFF UNAVAILABILITY ────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'staff_unavailability')
BEGIN
  CREATE TABLE staff_unavailability (
    id CHAR(36) NOT NULL PRIMARY KEY,
    driver_id CHAR(36) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason NVARCHAR(255),
    notes NVARCHAR(MAX),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_staff_unavail_driver' AND object_id = OBJECT_ID('staff_unavailability'))
  CREATE INDEX idx_staff_unavail_driver ON staff_unavailability(driver_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_staff_unavail_dates' AND object_id = OBJECT_ID('staff_unavailability'))
  CREATE INDEX idx_staff_unavail_dates ON staff_unavailability(start_date, end_date);

INSERT INTO staff_unavailability (id, driver_id, start_date, end_date, reason) VALUES
  (NEWID(), 'd1000000-0000-0000-0000-000000000005', CAST(DATEADD(DAY,  2, GETDATE()) AS DATE), CAST(DATEADD(DAY,  5, GETDATE()) AS DATE), 'Annual Leave'),
  (NEWID(), 'd1000000-0000-0000-0000-000000000004', CAST(DATEADD(DAY, 10, GETDATE()) AS DATE), CAST(DATEADD(DAY, 12, GETDATE()) AS DATE), 'Medical Appointment');

-- ─── 33. SETTINGS (key-value store) ──────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'settings')
BEGIN
  CREATE TABLE settings (
    id CHAR(36) NOT NULL PRIMARY KEY,
    key_name NVARCHAR(255) NOT NULL UNIQUE,
    value NVARCHAR(MAX),
    description NVARCHAR(MAX),
    updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_settings_key' AND object_id = OBJECT_ID('settings'))
  CREATE INDEX idx_settings_key ON settings(key_name);

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'app_name')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'app_name',             '"CastleAdmin"',           'Application display name');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'app_logo_url')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'app_logo_url',         'null',                    'URL to the application logo');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'primary_color')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'primary_color',        '"#6366f1"',               'Primary brand colour');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'terms_of_hire')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'terms_of_hire',        '"Standard terms apply."', 'Terms of hire shown to customers');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'tracking_pin_enabled')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'tracking_pin_enabled', 'true',                    'Enable order tracking PIN feature');

IF NOT EXISTS (SELECT 1 FROM settings WHERE key_name = 'maps_provider')
  INSERT INTO settings (id, key_name, value, description) VALUES (NEWID(), 'maps_provider',        '"google"',                'Maps provider: google or openstreetmap');

-- ─── 34. ORDER TRACKING PINS ─────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'order_tracking_pins')
BEGIN
  CREATE TABLE order_tracking_pins (
    id CHAR(36) NOT NULL PRIMARY KEY,
    order_id NVARCHAR(20) NOT NULL UNIQUE,
    pin NVARCHAR(10) NOT NULL,
    expires_at DATETIME2,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  )
END;

-- ─── 35. ANALYTICS REVENUE ───────────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'analytics_revenue')
BEGIN
  CREATE TABLE analytics_revenue (
    id CHAR(36) NOT NULL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    completed_orders INT NOT NULL DEFAULT 0,
    cancelled_orders INT NOT NULL DEFAULT 0,
    avg_order_value DECIMAL(10,2),
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  )
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_analytics_revenue_date' AND object_id = OBJECT_ID('analytics_revenue'))
  CREATE INDEX idx_analytics_revenue_date ON analytics_revenue(date);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -6, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -6, GETDATE()) AS DATE), 320.00, 3, 2, 0, 106.67);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -5, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -5, GETDATE()) AS DATE), 145.00, 1, 1, 0, 145.00);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -4, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -4, GETDATE()) AS DATE), 480.00, 4, 3, 1, 120.00);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -3, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -3, GETDATE()) AS DATE), 165.00, 1, 1, 0, 165.00);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -2, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -2, GETDATE()) AS DATE), 310.00, 2, 2, 0, 155.00);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(DATEADD(DAY, -1, GETDATE()) AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(DATEADD(DAY, -1, GETDATE()) AS DATE), 195.00, 1, 1, 0, 195.00);

IF NOT EXISTS (SELECT 1 FROM analytics_revenue WHERE date = CAST(GETDATE() AS DATE))
  INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES (NEWID(), CAST(GETDATE() AS DATE), 530.00, 4, 0, 0, 132.50);
