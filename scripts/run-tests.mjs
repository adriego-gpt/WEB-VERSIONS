import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const group = process.argv[2] || "all";
if (!["unit", "e2e", "all"].includes(group)) throw new Error("Usa unit, e2e o all.");
const groups = group === "all" ? ["unit", "e2e"] : [group];
const env = { ...process.env, NODE_ENV: "test", VERCEL_ENV: "test", SECURITY_LOG_ENABLED: "false" };
// A test run must not inherit production persistence, email or notification credentials.
for (const key of Object.keys(env)) if (/^(KV_|ADMIN_|USER_|GOOGLE_|IMAGEKIT_|TELEGRAM_|N8N_|SMTP_|RESEND_|PASSWORD_RESET_)/.test(key)) env[key] = "";
let failed = 0, suites = 0, tests = 0;
for (const folder of groups) {
  const directory = path.join(root, "tests", folder);
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".test.mjs")).sort();
  for (const file of files) {
    const result = spawnSync(process.execPath, [path.join(directory, file)], { cwd: root, env, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    suites += 1;
    const output = `${result.stdout || ""}${result.stderr || ""}`;
    tests += Number(output.match(/(?:ℹ|#) tests (\d+)/)?.[1]) || 0;
    if (result.status !== 0 || result.error) {
      failed += 1;
      console.error(`FAIL ${folder}/${file}\n${result.error?.message || ""}\n${output}`);
    } else console.log(`PASS ${folder}/${file}`);
  }
}
console.log(`Resultado: ${suites} archivos, ${tests} pruebas, ${failed} archivos con fallos.`);
process.exitCode = failed ? 1 : 0;
