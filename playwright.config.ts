import { defineConfig, devices } from "@playwright/test";

// Keys come from the author's .env.local (Clerk secret for test sign-in, Supabase URL and
// publishable key for the direct RLS checks). Nothing here prints them.
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets them as real environment variables instead
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global.setup.ts",
  // the two test users share one Clerk instance and one database, so run in order
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: BASE, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: BASE, reuseExistingServer: true, timeout: 120_000 },
});
