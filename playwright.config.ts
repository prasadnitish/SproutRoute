// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  projects: [
    {
      name: "mocked",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /smoke/,
    },
    {
      name: "smoke",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "https://sproutroute-production.up.railway.app",
      },
      testMatch: /smoke/,
    },
  ],
  use: {
    baseURL: "http://localhost:4173",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "cd src/frontend && npm run build && npm run preview -- --port 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
