-- MVP schema for "涨薪系统"
-- Notes:
-- - PII: id_no_enc/phone_enc are placeholders for encrypted bytes (handled in app layer later).
-- - id_no_hash is used for uniqueness/query match (HMAC-SHA256 in app layer later).

CREATE TABLE IF NOT EXISTS admin_users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('HR_ADMIN', 'HR_OPERATOR')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  dept       TEXT NOT NULL,
  job_title  TEXT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

  id_no_enc  BYTEA NOT NULL,
  id_no_hash CHAR(64) NOT NULL UNIQUE,
  id_last6   CHAR(6) NOT NULL,

  phone_enc  BYTEA NOT NULL,
  phone_norm TEXT NULL,
  phone_hash CHAR(64) NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employees_phone_hash_idx ON employees(phone_hash);

CREATE TABLE IF NOT EXISTS raise_campaigns (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  start_date     DATE NULL,
  end_date       DATE NULL,
  effective_date DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at   TIMESTAMPTZ NULL,

  created_by     BIGINT NULL REFERENCES admin_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raise_items (
  id                BIGSERIAL PRIMARY KEY,
  campaign_id       BIGINT NOT NULL REFERENCES raise_campaigns(id) ON DELETE CASCADE,
  employee_id       BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  raise_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  performance_grade CHAR(1) NOT NULL CHECK (performance_grade IN ('S', 'A', 'B', 'C')),
  remark            TEXT NULL,

  -- Admin override fields (published-only)
  override_reason   TEXT NULL,
  overridden_by     BIGINT NULL REFERENCES admin_users(id),
  overridden_at     TIMESTAMPTZ NULL,

  version           INT NOT NULL DEFAULT 1,
  updated_by        BIGINT NULL REFERENCES admin_users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT raise_items_campaign_employee_uniq UNIQUE (campaign_id, employee_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT NULL REFERENCES admin_users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  before_json JSONB NULL,
  after_json  JSONB NULL,
  reason      TEXT NULL,
  ip          TEXT NULL,
  user_agent  TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_time_idx ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity, entity_id);

