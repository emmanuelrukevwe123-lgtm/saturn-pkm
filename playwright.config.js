import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure",
    launchOptions: {
      env: { ...process.env, LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, "/tmp/saturn-playwright-libs/root/usr/lib/x86_64-linux-gnu"].filter(Boolean).join(":") },
    },
  },
  webServer: {
    command: "npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173/app.html",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
