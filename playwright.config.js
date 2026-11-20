import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: process.env.BROWSER_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tools/serve.js",
    url: "http://127.0.0.1:3100/health",
    env: { PORT: "3100" },
    reuseExistingServer: !process.env.CI,
  },
});
