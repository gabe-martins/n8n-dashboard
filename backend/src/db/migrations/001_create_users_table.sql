-- Users table: dashboard accounts (independent from n8n's own users)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  login VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  tag VARCHAR(100),
  activated BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index to speed up filtering active/inactive accounts (used on every login/verify)
CREATE INDEX IF NOT EXISTS idx_users_activated ON users (activated);

-- Index to speed up tag-based authorization lookups (non-admin workflow filtering)
CREATE INDEX IF NOT EXISTS idx_users_tag ON users (tag);

-- Keep updated_at accurate automatically instead of relying on callers to set it
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
