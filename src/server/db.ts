import { Pool } from "pg";

import { requireDatabaseUrl } from "@/server/env";

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: requireDatabaseUrl() });
  }
  return pool;
}

