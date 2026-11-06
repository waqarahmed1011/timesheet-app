import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// Each run gets its own brand-new database: nothing existing is reset or wiped.
// Point E2E_PG_URL at a local Postgres where this user can CREATE DATABASE.
const PG = process.env.E2E_PG_URL ?? "postgresql://app:app@localhost:5432/postgres";
process.env.E2E_DB_NAME ??= `timesheet_e2e_${Date.now()}`;
const TEST_DB = PG.replace(/\/[^/?]*(\?|$)/, `/${process.env.E2E_DB_NAME}$1`);
process.env.DATABASE_URL = TEST_DB;
const PORT = 3100;

// Runs once in the main process before the web server starts (worker processes also load this file).
if (!process.env.TEST_WORKER_INDEX) {
  const env = { ...process.env, DATABASE_URL: TEST_DB };
  execSync(`npx prisma db execute --url "${PG}" --stdin`, { input: `CREATE DATABASE "${process.env.E2E_DB_NAME}";`, env });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Pixel 7"] },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: TEST_DB, DEV_LOGIN: "1", AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-00", AUTH_TRUST_HOST: "true" },
  },
});
