import crypto from "crypto";

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const keylen = 32;
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$N=${N},r=${r},p=${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

const pwd = process.argv[2];
if (!pwd) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

console.log(hashPassword(pwd));

