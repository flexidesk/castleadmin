-- ============================================================
-- CastleAdmin MySQL Database Setup
-- Run this on: sql8.freesqldatabase.com / sql8822597
-- ============================================================

-- ─── 1. ADMIN USERS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin',
  is_active TINYINT(1) DEFAULT 1,
  reset_token VARCHAR(128),
  reset_token_expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_reset_token ON admin_users(reset_token);

INSERT INTO admin_users (id, email, password_hash, password_salt, full_name, role, is_active)
VALUES (
  'admin-default-001',
  'admin@castleadmin.com',
  '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  'default-salt',
  'Admin User',
  'admin',
  1
) ON DUPLICATE KEY UPDATE id=id;

-- ─── 2. DRIVERS ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  vehicle VARCHAR(100) NOT NULL,
  plate VARCHAR(20) NOT NULL,
  status ENUM('Available','On Route','Off Duty') DEFAULT 'Available',
  avatar VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT,
  auth_user_id CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_auth_user_id ON drivers(auth_user_id);

INSERT INTO drivers (id, name, phone, vehicle, plate, status, avatar, is_active) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Marcus Webb',   '07712 345678', 'Ford Transit',      'LN23 RKT', 'On Route',  'MW', 1),
  ('d1000000-0000-0000-0000-000000000002', 'Priya Nair',    '07845 678901', 'Mercedes Sprinter', 'BX21 VHJ', 'Available', 'PN', 1),
  ('d1000000-0000-0000-0000-000000000003', 'Tom Bridges',   '07923 112233', 'Ford Transit',      'YD22 MKL', 'On Route',  'TB', 1),
  ('d1000000-0000-0000-0000-000000000004', 'Leanne Carter', '07600 998877', 'Vauxhall Movano',   'GX20 PPT', 'Available', 'LC', 1),
  ('d1000000-0000-0000-0000-000000000005', 'Darren Hollis', '07711 556677', 'Mercedes Sprinter', 'KE19 ZXA', 'Off Duty',  'DH', 1)
ON DUPLICATE KEY UPDATE id=id;

-- ─── 3. ORDERS ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(20) PRIMARY KEY,
  woo_order_id VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  booking_type ENUM('Delivery','Collection') NOT NULL,
  status ENUM('Booking Accepted','Booking Assigned','Booking Out For Delivery','Booking Complete','Booking Cancelled') DEFAULT 'Booking Accepted',
  delivery_address_line1 VARCHAR(255),
  delivery_address_line2 VARCHAR(255),
  delivery_address_city VARCHAR(100),
  delivery_address_county VARCHAR(100),
  delivery_address_postcode VARCHAR(20),
  delivery_address_notes TEXT,
  driver_id CHAR(36),
  booking_date DATE NOT NULL,
  delivery_window VARCHAR(50) NOT NULL,
  collection_window VARCHAR(50),
  payment_status ENUM('Paid','Unpaid','Partial') DEFAULT 'Unpaid',
  payment_method ENUM('Card','Cash','Unrecorded') DEFAULT 'Unrecorded',
  payment_amount DECIMAL(10,2) DEFAULT 0,
  payment_recorded_at DATETIME,
  payment_recorded_by VARCHAR(255),
  payment_notes TEXT,
  products JSON,
  pod JSON,
  notes TEXT,
  custom_fields JSON,
  customer_rating TINYINT CHECK (customer_rating >= 1 AND customer_rating <= 5),
  delivery_duration_minutes INT,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  amount_due DECIMAL(10,2) DEFAULT 0,
  delivery_charge DECIMAL(10,2) DEFAULT 0,
  failure_reason TEXT,
  failure_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_booking_date ON orders(booking_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

INSERT INTO orders (id, woo_order_id, customer_name, customer_email, customer_phone, booking_type, status, delivery_address_line1, delivery_address_city, delivery_address_county, delivery_address_postcode, delivery_address_notes, driver_id, booking_date, delivery_window, collection_window, payment_status, payment_method, payment_amount, payment_recorded_at, payment_recorded_by, products, created_at, updated_at) VALUES
(
  'CA-1042', '#8841', 'Rachel Thornton', 'r.thornton@outlook.com', '07831 224455',
  'Delivery', 'Booking Out For Delivery',
  '14 Meadow Close', 'Leicester', 'Leicestershire', 'LE4 7RN',
  'Side gate is unlocked. Please set up in back garden.',
  'd1000000-0000-0000-0000-000000000001', '2026-03-15', '08:00 - 10:00', '18:00 - 20:00',
  'Paid', 'Card', 145.00, '2026-03-10 14:22:00', 'Sarah Atkinson',
  '[{"id":101,"name":"Frozen Elsa Castle - Large","sku":"BC-ELSA-LG","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"}]',
  '2026-03-10 14:20:00', '2026-03-15 08:47:00'
),
(
  'CA-1041', '#8839', 'James Okafor', 'j.okafor@gmail.com', '07900 334455',
  'Delivery', 'Booking Assigned',
  '7 Birchwood Avenue', 'Leicester', 'Leicestershire', 'LE2 5GH', NULL,
  'd1000000-0000-0000-0000-000000000003', '2026-03-15', '10:00 - 12:00', '19:00 - 21:00',
  'Unpaid', 'Cash', 175.00, NULL, NULL,
  '[{"id":103,"name":"Superhero Combo Castle","sku":"BC-SUPER-CMB","quantity":1,"unitPrice":175.00,"totalPrice":175.00,"category":"Combo Castle"}]',
  '2026-03-11 09:10:00', '2026-03-14 16:05:00'
),
(
  'CA-1040', '#8836', 'Sonia Patel', 'sonia.patel@hotmail.co.uk', '07724 889900',
  'Delivery', 'Booking Accepted',
  '3 Rosewood Drive', 'Loughborough', 'Leicestershire', 'LE11 3PQ', NULL,
  NULL, '2026-03-15', '12:00 - 14:00', '20:00 - 22:00',
  'Unpaid', 'Unrecorded', 130.00, NULL, NULL,
  '[{"id":104,"name":"Princess Palace Castle - Medium","sku":"BC-PRIN-MD","quantity":1,"unitPrice":130.00,"totalPrice":130.00,"category":"Bouncy Castle"}]',
  '2026-03-12 11:30:00', '2026-03-12 11:30:00'
),
(
  'CA-1039', '#8830', 'Daniel Hughes', 'd.hughes@company.co.uk', '07811 667788',
  'Delivery', 'Booking Out For Delivery',
  '22 Oak Lane', 'Hinckley', 'Leicestershire', 'LE10 0AB', NULL,
  'd1000000-0000-0000-0000-000000000003', '2026-03-15', '09:00 - 11:00', '18:30 - 20:30',
  'Paid', 'Card', 185.00, '2026-03-09 10:00:00', 'Sarah Atkinson',
  '[{"id":105,"name":"Jungle Safari Castle","sku":"BC-JUNG-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"},{"id":106,"name":"Safety Crash Mat Set","sku":"ACC-MAT-SET","quantity":2,"unitPrice":15.00,"totalPrice":30.00,"category":"Accessory"}]',
  '2026-03-09 09:55:00', '2026-03-15 09:15:00'
),
(
  'CA-1038', '#8825', 'Natalie Frost', 'nat.frost@gmail.com', '07955 443322',
  'Collection', 'Booking Complete',
  'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL,
  NULL, '2026-03-14', '10:00 - 11:00', NULL,
  'Paid', 'Cash', 95.00, '2026-03-14 10:45:00', 'Sarah Atkinson',
  '[{"id":107,"name":"Classic Red & Blue Castle - Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":95.00,"totalPrice":95.00,"category":"Bouncy Castle"}]',
  '2026-03-08 15:00:00', '2026-03-14 10:44:00'
),
(
  'CA-1037', '#8820', 'Connor Gallagher', 'cgallagher@live.co.uk', '07700 112233',
  'Delivery', 'Booking Complete',
  '9 Willow Street', 'Coalville', 'Leicestershire', 'LE67 3BT', NULL,
  NULL, '2026-03-14', '08:30 - 10:30', '19:00 - 21:00',
  'Paid', 'Card', 165.00, '2026-03-13 17:00:00', 'Sarah Atkinson',
  '[{"id":108,"name":"Dinosaur Dino World Castle","sku":"BC-DINO-LG","quantity":1,"unitPrice":165.00,"totalPrice":165.00,"category":"Bouncy Castle"}]',
  '2026-03-07 10:00:00', '2026-03-14 09:06:00'
),
(
  'CA-1036', '#8815', 'Amelia Rhodes', 'amelia.rhodes@yahoo.co.uk', '07888 776655',
  'Delivery', 'Booking Accepted',
  '51 Granby Street', 'Melton Mowbray', 'Leicestershire', 'LE13 1JZ', NULL,
  NULL, '2026-03-16', '09:00 - 11:00', '19:00 - 21:00',
  'Unpaid', 'Cash', 155.00, NULL, NULL,
  '[{"id":109,"name":"Unicorn Rainbow Castle - Large","sku":"BC-UNI-LG","quantity":1,"unitPrice":155.00,"totalPrice":155.00,"category":"Bouncy Castle"}]',
  '2026-03-13 14:00:00', '2026-03-13 14:00:00'
),
(
  'CA-1035', '#8810', 'Ben Whitfield', 'benw@btinternet.com', '07744 998877',
  'Collection', 'Booking Assigned',
  'Unit 4, Castle Depot', 'Leicester', 'Leicestershire', 'LE19 1WW', NULL,
  'd1000000-0000-0000-0000-000000000002', '2026-03-16', '11:00 - 12:00', NULL,
  'Unpaid', 'Card', 195.00, NULL, NULL,
  '[{"id":110,"name":"Football Pitch Inflatable","sku":"BC-FOOT-LG","quantity":1,"unitPrice":195.00,"totalPrice":195.00,"category":"Inflatable"}]',
  '2026-03-14 08:30:00', '2026-03-14 08:30:00'
),
(
  'CA-1034', '#8805', 'Lucy Hargreaves', 'lucy.h@gmail.com', '07811 223344',
  'Delivery', 'Booking Complete',
  '12 Park Road', 'Leicester', 'Leicestershire', 'LE1 2AB', NULL,
  NULL, '2026-03-13', '09:00 - 11:00', '18:00 - 20:00',
  'Paid', 'Card', 120.00, '2026-03-13 09:30:00', 'Sarah Atkinson',
  '[{"id":111,"name":"Classic Castle Small","sku":"BC-CLASS-SM","quantity":1,"unitPrice":120.00,"totalPrice":120.00,"category":"Bouncy Castle"}]',
  '2026-03-10 10:00:00', '2026-03-13 18:00:00'
),
(
  'CA-1033', '#8800', 'Oliver Marsh', 'o.marsh@outlook.com', '07922 334455',
  'Delivery', 'Booking Complete',
  '5 High Street', 'Loughborough', 'Leicestershire', 'LE11 1AA', NULL,
  NULL, '2026-03-12', '10:00 - 12:00', '19:00 - 21:00',
  'Paid', 'Cash', 145.00, '2026-03-12 10:30:00', 'Sarah Atkinson',
  '[{"id":112,"name":"Pirate Ship Castle","sku":"BC-PIR-MD","quantity":1,"unitPrice":145.00,"totalPrice":145.00,"category":"Bouncy Castle"}]',
  '2026-03-09 11:00:00', '2026-03-12 19:00:00'
)
ON DUPLICATE KEY UPDATE id=id;

-- ─── 4. VEHICLES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  registration VARCHAR(20) NOT NULL,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INT,
  colour VARCHAR(50),
  type VARCHAR(50) NOT NULL DEFAULT 'Van',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  assigned_driver_id CHAR(36),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_vehicles_registration (registration),
  FOREIGN KEY (assigned_driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_driver ON vehicles(assigned_driver_id);

INSERT INTO vehicles (id, registration, make, model, year, colour, type, assigned_driver_id) VALUES
  (UUID(), 'LN23 RKT', 'Ford',       'Transit',  2023, 'White',  'Van',      'd1000000-0000-0000-0000-000000000001'),
  (UUID(), 'BX21 VHJ', 'Mercedes',   'Sprinter', 2021, 'Silver', 'Van',      'd1000000-0000-0000-0000-000000000002'),
  (UUID(), 'YD22 MKL', 'Ford',       'Transit',  2022, 'White',  'Van',      'd1000000-0000-0000-0000-000000000003'),
  (UUID(), 'GX20 PPT', 'Vauxhall',   'Movano',   2020, 'Grey',   'Large Van','d1000000-0000-0000-0000-000000000004'),
  (UUID(), 'KE19 ZXA', 'Mercedes',   'Sprinter', 2019, 'White',  'Van',      'd1000000-0000-0000-0000-000000000005')
ON DUPLICATE KEY UPDATE registration=registration;

-- ─── 5. DRIVER PORTAL CREDENTIALS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_portal_credentials (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_portal_creds_username ON driver_portal_credentials(username);

-- ─── 6. DRIVER LOCATIONS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_locations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  accuracy DECIMAL(10,2),
  heading DECIMAL(5,2),
  speed DECIMAL(8,2),
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_id ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at ON driver_locations(recorded_at);

-- ─── 7. DRIVER PERFORMANCE LOGS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_performance_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  order_id VARCHAR(20),
  delivery_date DATE NOT NULL,
  was_successful TINYINT(1) NOT NULL DEFAULT 1,
  duration_minutes INT,
  customer_rating TINYINT CHECK (customer_rating >= 1 AND customer_rating <= 5),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_perf_driver_id ON driver_performance_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_perf_delivery_date ON driver_performance_logs(delivery_date);

INSERT INTO driver_performance_logs (id, driver_id, delivery_date, was_successful, duration_minutes, customer_rating) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', CURDATE() - INTERVAL 1 DAY,  1, 45, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', CURDATE() - INTERVAL 2 DAY,  1, 60, 4),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', CURDATE() - INTERVAL 3 DAY,  1, 55, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', CURDATE() - INTERVAL 5 DAY,  0, 90, 2),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', CURDATE() - INTERVAL 7 DAY,  1, 40, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', CURDATE() - INTERVAL 1 DAY,  1, 50, 4),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', CURDATE() - INTERVAL 2 DAY,  1, 65, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', CURDATE() - INTERVAL 4 DAY,  1, 35, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', CURDATE() - INTERVAL 6 DAY,  0, 80, 1),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', CURDATE() - INTERVAL 1 DAY,  1, 70, 4),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', CURDATE() - INTERVAL 3 DAY,  1, 45, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', CURDATE() - INTERVAL 5 DAY,  1, 55, 4),
  (UUID(), 'd1000000-0000-0000-0000-000000000004', CURDATE() - INTERVAL 2 DAY,  1, 60, 5),
  (UUID(), 'd1000000-0000-0000-0000-000000000004', CURDATE() - INTERVAL 4 DAY,  0, 95, 2),
  (UUID(), 'd1000000-0000-0000-0000-000000000005', CURDATE() - INTERVAL 3 DAY,  1, 50, 4);

-- ─── 8. DRIVER EARNINGS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_earnings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  order_id VARCHAR(20),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  type ENUM('delivery','bonus','deduction') NOT NULL DEFAULT 'delivery',
  notes TEXT,
  earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver_id ON driver_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_earned_at ON driver_earnings(earned_at);

INSERT INTO driver_earnings (id, driver_id, order_id, amount, type, earned_at) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1042', 18.50, 'delivery', '2026-03-15 10:00:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1039', 22.00, 'delivery', '2026-03-15 11:30:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', NULL,       15.00, 'bonus',    '2026-03-14 17:00:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', 'CA-1035', 20.00, 'delivery', '2026-03-16 12:00:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1041', 19.50, 'delivery', '2026-03-15 12:30:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1039', 22.00, 'delivery', '2026-03-15 11:00:00');

-- ─── 9. DRIVER CASH ALLOCATIONS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_cash_allocations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  order_id VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_cash_alloc_driver ON driver_cash_allocations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_cash_alloc_order ON driver_cash_allocations(order_id);

CREATE TABLE IF NOT EXISTS driver_cash_collections (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  collected_by VARCHAR(255) NOT NULL DEFAULT 'Admin',
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_cash_coll_driver ON driver_cash_collections(driver_id);

INSERT INTO driver_cash_allocations (id, driver_id, order_id, amount, allocated_at) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 'CA-1041', 175.00, '2026-03-15 12:30:00'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 'CA-1038', 95.00,  '2026-03-14 11:00:00');

INSERT INTO driver_cash_collections (id, driver_id, amount, collected_at, collected_by) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 175.00, '2026-03-16 09:00:00', 'Admin'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 95.00,  '2026-03-15 09:00:00', 'Admin');

-- ─── 10. DRIVER SHIFT TEMPLATES ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_shift_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sun,1=Mon,...,6=Sat',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  pay_rate DECIMAL(10,2),
  pay_rate_type ENUM('hourly','fixed','per_delivery') DEFAULT 'hourly',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_driver ON driver_shift_templates(driver_id);

INSERT INTO driver_shift_templates (id, driver_id, day_of_week, start_time, end_time, pay_rate, pay_rate_type) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 1, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 2, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 3, '08:00:00', '17:00:00', 12.50, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', 1, '09:00:00', '18:00:00', 13.00, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', 3, '09:00:00', '18:00:00', 13.00, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', 5, '09:00:00', '14:00:00', 13.00, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 2, '07:00:00', '16:00:00', 12.00, 'hourly'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 4, '07:00:00', '16:00:00', 12.00, 'hourly');

-- ─── 11. DRIVER INSPECTION SCHEDULES ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_inspection_schedules (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  vehicle_id CHAR(36),
  driver_id CHAR(36),
  inspection_type VARCHAR(100) NOT NULL DEFAULT 'routine',
  scheduled_date DATE NOT NULL,
  completed_at DATETIME,
  status ENUM('scheduled','completed','overdue','cancelled') DEFAULT 'scheduled',
  notes TEXT,
  is_recurring TINYINT(1) DEFAULT 0,
  recurrence_interval_days INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_driver ON driver_inspection_schedules(driver_id);
CREATE INDEX IF NOT EXISTS idx_inspection_date ON driver_inspection_schedules(scheduled_date);

INSERT INTO driver_inspection_schedules (id, driver_id, inspection_type, scheduled_date, status) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000001', 'routine',   CURDATE() + INTERVAL 7 DAY,  'scheduled'),
  (UUID(), 'd1000000-0000-0000-0000-000000000002', 'routine',   CURDATE() + INTERVAL 14 DAY, 'scheduled'),
  (UUID(), 'd1000000-0000-0000-0000-000000000003', 'safety',    CURDATE() - INTERVAL 2 DAY,  'overdue'),
  (UUID(), 'd1000000-0000-0000-0000-000000000004', 'routine',   CURDATE() + INTERVAL 3 DAY,  'scheduled'),
  (UUID(), 'd1000000-0000-0000-0000-000000000005', 'full_check', CURDATE() - INTERVAL 5 DAY, 'overdue');

-- ─── 12. DRIVER POD SUBMISSIONS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS driver_pod_submissions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_id VARCHAR(20) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  signed_by VARCHAR(255) NOT NULL,
  signature_data_url MEDIUMTEXT,
  notes TEXT,
  photos JSON,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_pod_order_id ON driver_pod_submissions(order_id);
CREATE INDEX IF NOT EXISTS idx_driver_pod_driver_id ON driver_pod_submissions(driver_id);

-- ─── 13. FLEET CONFIG ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fleet_config (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  company_name VARCHAR(255) NOT NULL DEFAULT 'CastleAdmin Fleet',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/London',
  currency VARCHAR(10) NOT NULL DEFAULT 'GBP',
  base_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  per_km_fee DECIMAL(10,2) NOT NULL DEFAULT 0.50,
  min_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 3.00,
  max_delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  fee_structure VARCHAR(50) NOT NULL DEFAULT 'flat',
  delivery_fee_enabled TINYINT(1) NOT NULL DEFAULT 0,
  auto_zone_allocation TINYINT(1) NOT NULL DEFAULT 0,
  company_address TEXT,
  company_phone VARCHAR(50),
  company_email VARCHAR(255),
  map_default_postcode VARCHAR(20),
  map_default_lat DECIMAL(10,8),
  map_default_lng DECIMAL(11,8),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO fleet_config (id, company_name, timezone, currency, base_delivery_fee, per_km_fee, min_delivery_fee, max_delivery_fee, fee_structure, company_address, company_phone, company_email)
VALUES (
  UUID(), 'CastleAdmin Fleet', 'Europe/London', 'GBP', 5.00, 0.50, 3.00, 50.00, 'flat',
  '123 Fleet Street, London, EC4A 2BB', '+44 20 7946 0958', 'admin@castlefleet.co.uk'
);

-- ─── 14. NOTIFICATION PREFERENCES ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  notify_new_order TINYINT(1) NOT NULL DEFAULT 1,
  notify_order_status_change TINYINT(1) NOT NULL DEFAULT 1,
  notify_driver_assigned TINYINT(1) NOT NULL DEFAULT 1,
  notify_delivery_complete TINYINT(1) NOT NULL DEFAULT 1,
  notify_delivery_failed TINYINT(1) NOT NULL DEFAULT 1,
  notify_driver_offline TINYINT(1) NOT NULL DEFAULT 0,
  notify_low_driver_availability TINYINT(1) NOT NULL DEFAULT 1,
  email_notifications TINYINT(1) NOT NULL DEFAULT 1,
  sms_notifications TINYINT(1) NOT NULL DEFAULT 0,
  push_notifications TINYINT(1) NOT NULL DEFAULT 1,
  notification_email VARCHAR(255),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO notification_preferences (id, notification_email)
VALUES (UUID(), 'admin@castlefleet.co.uk');

-- ─── 15. USER ROLES ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id CHAR(36),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL DEFAULT '',
  role ENUM('admin','manager','dispatcher','viewer') NOT NULL DEFAULT 'viewer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  can_create_orders TINYINT(1) NOT NULL DEFAULT 0,
  can_edit_orders TINYINT(1) NOT NULL DEFAULT 0,
  can_delete_orders TINYINT(1) NOT NULL DEFAULT 0,
  can_manage_drivers TINYINT(1) NOT NULL DEFAULT 0,
  can_view_analytics TINYINT(1) NOT NULL DEFAULT 0,
  can_manage_settings TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_roles_email ON user_roles(email);

INSERT INTO user_roles (id, email, full_name, role, is_active, can_create_orders, can_edit_orders, can_delete_orders, can_manage_drivers, can_view_analytics, can_manage_settings) VALUES
  (UUID(), 'admin@castlefleet.co.uk',      'System Admin',         'admin',      1, 1, 1, 1, 1, 1, 1),
  (UUID(), 'manager@castlefleet.co.uk',    'Operations Manager',   'manager',    1, 1, 1, 0, 1, 1, 0),
  (UUID(), 'dispatcher@castlefleet.co.uk', 'Dispatch Controller',  'dispatcher', 1, 1, 1, 0, 0, 0, 0),
  (UUID(), 'viewer@castlefleet.co.uk',     'Read-Only User',       'viewer',     1, 0, 0, 0, 0, 1, 0);

-- ─── 16. SYSTEM INTEGRATIONS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_integrations (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  api_key TEXT,
  api_secret TEXT,
  webhook_url TEXT,
  config JSON,
  last_synced_at DATETIME,
  status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_integrations_slug ON system_integrations(slug);

INSERT INTO system_integrations (id, name, slug, description, is_enabled, status) VALUES
  (UUID(), 'WooCommerce', 'woocommerce', 'Sync orders from WooCommerce store', 1, 'connected'),
  (UUID(), 'Google Maps', 'google-maps', 'Route optimisation and geocoding', 0, 'disconnected'),
  (UUID(), 'Stripe', 'stripe', 'Payment processing and invoicing', 0, 'disconnected'),
  (UUID(), 'Twilio SMS', 'twilio', 'SMS notifications to customers and drivers', 0, 'disconnected'),
  (UUID(), 'SendGrid', 'sendgrid', 'Transactional email delivery', 0, 'disconnected'),
  (UUID(), 'Slack', 'slack', 'Team notifications and alerts', 0, 'disconnected')
ON DUPLICATE KEY UPDATE slug=slug;

-- ─── 17. WOOCOMMERCE SETTINGS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS woocommerce_settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  store_url TEXT NOT NULL DEFAULT '',
  consumer_key TEXT NOT NULL DEFAULT '',
  consumer_secret TEXT NOT NULL DEFAULT '',
  is_connected TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_tested_at DATETIME,
  last_test_status VARCHAR(50),
  last_test_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO woocommerce_settings (id, store_url, consumer_key, consumer_secret, is_connected)
VALUES (UUID(), '', '', '', 0);

-- ─── 18. WOOCOMMERCE FIELD MAPPING ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS woocommerce_field_mapping (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  woo_field VARCHAR(255) NOT NULL,
  local_field VARCHAR(255) NOT NULL,
  transform VARCHAR(100),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 19. WOOCOMMERCE SYNC LOG ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS woocommerce_sync_log (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  sync_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  orders_synced INT NOT NULL DEFAULT 0,
  orders_created INT NOT NULL DEFAULT 0,
  orders_updated INT NOT NULL DEFAULT 0,
  orders_failed INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  status VARCHAR(50) NOT NULL DEFAULT 'running'
);

-- ─── 20. WOOCOMMERCE WEBHOOK LOG ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS woocommerce_webhook_log (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  event_type VARCHAR(100) NOT NULL,
  woo_order_id VARCHAR(50),
  payload JSON,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  error_message TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 21. WEBHOOK EVENT LOGS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_event_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  event_type VARCHAR(100) NOT NULL,
  source VARCHAR(100),
  payload JSON,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  error_message TEXT,
  order_id VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_event ON webhook_event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_event_logs_created ON webhook_event_logs(created_at);

-- ─── 22. WEBHOOK CONFIGS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_configs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  events JSON,
  secret VARCHAR(255),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_triggered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 23. WEBHOOK REQUEST LOGS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_request_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  webhook_config_id CHAR(36),
  event_type VARCHAR(100),
  url TEXT,
  request_payload JSON,
  response_status INT,
  response_body TEXT,
  duration_ms INT,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 24. MESSAGE TEMPLATES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_templates (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  channel ENUM('email','sms') NOT NULL DEFAULT 'email',
  trigger_type ENUM('new_assignment','delivery_failure','payment_issue','daily_summary','booking_accepted','booking_assigned','booking_out_for_delivery','booking_complete','custom') NOT NULL DEFAULT 'custom',
  subject VARCHAR(500),
  body TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_admin_alert TINYINT(1) NOT NULL DEFAULT 0,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_message_templates_channel ON message_templates(channel);
CREATE INDEX IF NOT EXISTS idx_message_templates_trigger ON message_templates(trigger_type);

INSERT INTO message_templates (id, name, channel, trigger_type, subject, body, is_active, is_admin_alert, description) VALUES
  (UUID(), 'New Assignment Alert', 'email', 'new_assignment', 'New Booking Assigned – {{order_id}}', '<p>Hi Admin,</p><p>A new booking has been assigned.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Customer:</strong> {{customer_name}}<br/><strong>Status:</strong> {{status}}</p>', 1, 1, 'Sent to admin when a new booking is assigned to a driver'),
  (UUID(), 'Delivery Failure Alert', 'email', 'delivery_failure', 'Delivery Failed – {{order_id}}', '<p>Hi Admin,</p><p>A delivery has failed and requires attention.</p><p><strong>Order ID:</strong> {{order_id}}<br/><strong>Customer:</strong> {{customer_name}}</p>', 1, 1, 'Sent to admin when a delivery fails'),
  (UUID(), 'Booking Accepted – Customer', 'email', 'booking_accepted', 'Your Booking Has Been Accepted – {{order_id}}', '<p>Hi {{customer_name}},</p><p>Your booking has been accepted.</p><p><strong>Order ID:</strong> {{order_id}}</p>', 1, 0, 'Sent to customer when their booking is accepted'),
  (UUID(), 'Out For Delivery – Customer SMS', 'sms', 'booking_out_for_delivery', NULL, 'Hi {{customer_name}}, your order {{order_id}} is out for delivery! Track it here: {{tracking_link}}', 1, 0, 'SMS sent to customer when their order is out for delivery'),
  (UUID(), 'Delivery Complete – Customer', 'email', 'booking_complete', 'Your Delivery Is Complete – {{order_id}}', '<p>Hi {{customer_name}},</p><p>Your order has been successfully delivered!</p><p><strong>Order ID:</strong> {{order_id}}</p>', 1, 0, 'Sent to customer when their delivery is complete');

-- ─── 25. EMAIL ALERT LOGS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_alert_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  template_id CHAR(36),
  trigger_type ENUM('new_assignment','delivery_failure','payment_issue','daily_summary','booking_accepted','booking_assigned','booking_out_for_delivery','booking_complete','custom') NOT NULL,
  channel ENUM('email','sms') NOT NULL DEFAULT 'email',
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'sent',
  error_message TEXT,
  order_id VARCHAR(20),
  metadata JSON,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_alert_logs_trigger ON email_alert_logs(trigger_type);
CREATE INDEX IF NOT EXISTS idx_email_alert_logs_sent_at ON email_alert_logs(sent_at);

-- ─── 26. SMS ALERT LOGS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_alert_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_id VARCHAR(20),
  recipient_phone VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'sent',
  provider VARCHAR(50) DEFAULT 'twilio',
  provider_message_id VARCHAR(255),
  error_message TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_alert_logs_order ON sms_alert_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_sms_alert_logs_sent_at ON sms_alert_logs(sent_at);

-- ─── 27. PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  driver_id CHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

-- ─── 28. NOTIFICATIONS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  order_id VARCHAR(20),
  driver_id CHAR(36),
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

INSERT INTO notifications (id, title, message, type, is_read, order_id) VALUES
  (UUID(), 'New Order Received', 'Order CA-1042 has been placed by Rachel Thornton', 'order', 0, 'CA-1042'),
  (UUID(), 'Driver Assigned', 'Marcus Webb has been assigned to order CA-1042', 'assignment', 0, 'CA-1042'),
  (UUID(), 'Delivery Complete', 'Order CA-1038 has been delivered successfully', 'success', 1, 'CA-1038'),
  (UUID(), 'Payment Received', 'Payment of £145.00 recorded for order CA-1042', 'payment', 1, 'CA-1042');

-- ─── 29. DELIVERY ZONES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_zones (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  polygon_geojson JSON NOT NULL,
  driver_id CHAR(36),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_driver ON delivery_zones(driver_id);

INSERT INTO delivery_zones (id, name, description, color, polygon_geojson, driver_id, is_active) VALUES
  (UUID(), 'North Zone', 'North Leicester & Loughborough area', '#3b82f6', '{"type":"Polygon","coordinates":[[[-1.15,52.68],[-1.05,52.68],[-1.05,52.75],[-1.15,52.75],[-1.15,52.68]]]}', 'd1000000-0000-0000-0000-000000000001', 1),
  (UUID(), 'South Zone', 'South Leicester & Hinckley area', '#22c55e', '{"type":"Polygon","coordinates":[[[-1.18,52.58],[-1.08,52.58],[-1.08,52.63],[-1.18,52.63],[-1.18,52.58]]]}', 'd1000000-0000-0000-0000-000000000002', 1),
  (UUID(), 'Central Zone', 'City centre & LE1-LE5 postcodes', '#ec4899', '{"type":"Polygon","coordinates":[[[-1.14,52.62],[-1.10,52.62],[-1.10,52.65],[-1.14,52.65],[-1.14,52.62]]]}', 'd1000000-0000-0000-0000-000000000003', 1);

-- ─── 30. CUSTOMERS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50) NOT NULL,
  address TEXT,
  notes TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

INSERT INTO customers (id, name, email, phone, address, notes, is_active) VALUES
  (UUID(), 'Rachel Thornton',  'r.thornton@outlook.com',       '07831 224455', '14 Meadow Close, Leicester, LE4 7RN',     'Prefers morning deliveries', 1),
  (UUID(), 'James Okafor',     'j.okafor@gmail.com',           '07900 334455', '7 Birchwood Avenue, Leicester, LE2 5GH',  NULL, 1),
  (UUID(), 'Sonia Patel',      'sonia.patel@hotmail.co.uk',    '07724 889900', '3 Rosewood Drive, Loughborough, LE11 3PQ', NULL, 1),
  (UUID(), 'Daniel Hughes',    'd.hughes@company.co.uk',       '07811 667788', '22 Oak Lane, Hinckley, LE10 0AB',         'Business account', 1),
  (UUID(), 'Natalie Frost',    'nat.frost@gmail.com',          '07955 443322', 'Unit 4, Castle Depot, Leicester, LE19 1WW', NULL, 1),
  (UUID(), 'Connor Gallagher', 'cgallagher@live.co.uk',        '07700 112233', '9 Willow Street, Coalville, LE67 3BT',    NULL, 1),
  (UUID(), 'Amelia Rhodes',    'amelia.rhodes@yahoo.co.uk',    '07888 776655', '51 Granby Street, Melton Mowbray, LE13 1JZ', NULL, 1),
  (UUID(), 'Ben Whitfield',    'benw@btinternet.com',          '07744 998877', 'Unit 4, Castle Depot, Leicester, LE19 1WW', NULL, 1);

-- ─── 31. ACTIVITY LOGS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(100),
  user_email VARCHAR(255),
  details JSON,
  ip_address VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);

INSERT INTO activity_logs (id, action, entity_type, entity_id, user_email, details) VALUES
  (UUID(), 'order.created',   'order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","customer":"Rachel Thornton"}'),
  (UUID(), 'driver.assigned', 'order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","driver":"Marcus Webb"}'),
  (UUID(), 'payment.recorded','order',  'CA-1042', 'admin@castlefleet.co.uk', '{"order_id":"CA-1042","amount":145.00,"method":"Card"}'),
  (UUID(), 'order.completed', 'order',  'CA-1038', 'admin@castlefleet.co.uk', '{"order_id":"CA-1038","customer":"Natalie Frost"}'),
  (UUID(), 'driver.created',  'driver', 'd1000000-0000-0000-0000-000000000001', 'admin@castlefleet.co.uk', '{"driver":"Marcus Webb"}');

-- ─── 32. STAFF UNAVAILABILITY ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_unavailability (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  driver_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_unavail_driver ON staff_unavailability(driver_id);
CREATE INDEX IF NOT EXISTS idx_staff_unavail_dates ON staff_unavailability(start_date, end_date);

INSERT INTO staff_unavailability (id, driver_id, start_date, end_date, reason) VALUES
  (UUID(), 'd1000000-0000-0000-0000-000000000005', CURDATE() + INTERVAL 2 DAY, CURDATE() + INTERVAL 5 DAY, 'Annual Leave'),
  (UUID(), 'd1000000-0000-0000-0000-000000000004', CURDATE() + INTERVAL 10 DAY, CURDATE() + INTERVAL 12 DAY, 'Medical Appointment');

-- ─── 33. SETTINGS (key-value store) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  key_name VARCHAR(255) NOT NULL UNIQUE,
  value JSON,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key_name);

INSERT INTO settings (id, key_name, value, description) VALUES
  (UUID(), 'app_name',           '"CastleAdmin"',                    'Application display name'),
  (UUID(), 'app_logo_url',       'null',                             'URL to the application logo'),
  (UUID(), 'primary_color',      '"#6366f1"',                        'Primary brand colour'),
  (UUID(), 'terms_of_hire',      '"Standard terms apply."',          'Terms of hire shown to customers'),
  (UUID(), 'tracking_pin_enabled', 'true',                           'Enable order tracking PIN feature'),
  (UUID(), 'maps_provider',      '"google"',                         'Maps provider: google or openstreetmap')
ON DUPLICATE KEY UPDATE key_name=key_name;

-- ─── 34. ORDER TRACKING PINS ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_tracking_pins (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  order_id VARCHAR(20) NOT NULL UNIQUE,
  pin VARCHAR(10) NOT NULL,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ─── 35. ANALYTICS REVENUE ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_revenue (
  id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  date DATE NOT NULL,
  total_revenue DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_orders INT NOT NULL DEFAULT 0,
  completed_orders INT NOT NULL DEFAULT 0,
  cancelled_orders INT NOT NULL DEFAULT 0,
  avg_order_value DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_revenue_date ON analytics_revenue(date);

INSERT INTO analytics_revenue (id, date, total_revenue, total_orders, completed_orders, cancelled_orders, avg_order_value) VALUES
  (UUID(), CURDATE() - INTERVAL 6 DAY, 320.00, 3, 2, 0, 106.67),
  (UUID(), CURDATE() - INTERVAL 5 DAY, 145.00, 1, 1, 0, 145.00),
  (UUID(), CURDATE() - INTERVAL 4 DAY, 480.00, 4, 3, 1, 120.00),
  (UUID(), CURDATE() - INTERVAL 3 DAY, 165.00, 1, 1, 0, 165.00),
  (UUID(), CURDATE() - INTERVAL 2 DAY, 310.00, 2, 2, 0, 155.00),
  (UUID(), CURDATE() - INTERVAL 1 DAY, 195.00, 1, 1, 0, 195.00),
  (UUID(), CURDATE(),                  530.00, 4, 0, 0, 132.50)
ON DUPLICATE KEY UPDATE date=date;
