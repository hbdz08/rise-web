import crypto from "crypto";
import { Pool } from "pg";

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const keylen = 32;
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in env");
  process.exit(1);
}

const username = (process.env.ADMIN_USERNAME || "admin").trim();
const password = (process.env.ADMIN_PASSWORD || "Suze520..").trim();
const role = (process.env.ADMIN_ROLE || "HR_ADMIN").trim();

if (!username || !password) {
  console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD (and optionally ADMIN_ROLE=HR_ADMIN|HR_OPERATOR)");
  process.exit(1);
}
if (role !== "HR_ADMIN" && role !== "HR_OPERATOR") {
  console.error("ADMIN_ROLE must be HR_ADMIN or HR_OPERATOR");
  process.exit(1);
}

const passwordHash = hashPassword(password);
const pool = new Pool({ connectionString: databaseUrl });

try {
  const { rows } = await pool.query(
    `INSERT INTO admin_users (username, password_hash, role, status)
     VALUES ($1,$2,$3,'active')
     ON CONFLICT (username)
     DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, updated_at=NOW()
     RETURNING id`,
    [username, passwordHash, role],
  );
  console.log(`OK admin user id=${rows[0]?.id}`);
} finally {
  await pool.end();
}

