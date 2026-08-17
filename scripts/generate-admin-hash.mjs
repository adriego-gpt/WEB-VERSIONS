import crypto from "node:crypto";

const password = String(process.argv[2] || "").trim();
const algorithm = String(process.argv[3] || "scrypt").trim().toLowerCase();

if (!password) {
  console.error('Uso: node scripts/generate-admin-hash.mjs "TuPassword123" [scrypt|sha256]');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("base64url");
const hash = algorithm === "sha256"
  ? crypto.createHash("sha256").update(`${salt}::${password}`).digest("hex")
  : crypto.scryptSync(password, salt, 64).toString("hex");

console.log(`ADMIN_PASSWORD_ALGORITHM=${algorithm === "sha256" ? "sha256" : "scrypt"}`);
console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
