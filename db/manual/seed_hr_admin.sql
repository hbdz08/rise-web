-- 手工初始化 HR_ADMIN 账号（不会被 docker init 自动执行）
--
-- 用法示例（Windows PowerShell）：
--   psql "$env:DATABASE_URL" -f db/manual/seed_hr_admin.sql
--
-- 1) 先生成密码 hash（示例）：
--   node scripts/hash-password.mjs "YourPassword"
-- 2) 把下面的 'REPLACE_WITH_SCRYPT_HASH' 替换为完整输出（以 scrypt$ 开头的整串）

INSERT INTO admin_users (username, password_hash, role, status)
VALUES ('admin', 'REPLACE_WITH_SCRYPT_HASH', 'HR_ADMIN', 'active')
ON CONFLICT (username)
DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    role          = EXCLUDED.role,
    status        = EXCLUDED.status,
    updated_at    = NOW();

