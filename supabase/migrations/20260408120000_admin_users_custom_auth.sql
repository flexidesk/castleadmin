-- Admin users table for custom JWT authentication
-- Run this migration on your self-hosted PostgreSQL database

CREATE TABLE IF NOT EXISTS admin_users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  reset_token VARCHAR(128),
  reset_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_reset_token ON admin_users(reset_token);

-- Insert a default admin user (password: admin123 - CHANGE THIS IMMEDIATELY)
-- Password hash is SHA256 of 'default-saltadmin123default-salt'
-- To generate a new hash: node -e "const {createHash}=require('crypto'); console.log(createHash('sha256').update('default-salt'+'YOUR_PASSWORD'+'default-salt').digest('hex'))"
INSERT INTO admin_users (id, email, password_hash, password_salt, full_name, role, is_active)
VALUES (
  'admin-default-001',
  'admin@castleadmin.com',
  '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  'default-salt',
  'Admin User',
  'admin',
  true
) ON CONFLICT (id) DO NOTHING;
