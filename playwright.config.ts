import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  outputDir: "/private/tmp/swag-charter-e2e-results",
  use: {
    baseURL: process.env["SWAG_BROWSER_ORIGIN"] || "http://127.0.0.1:4175",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
      },
    },
    {
      name: "tablet",
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 1024, height: 768 } },
    },
    {
      name: "narrow",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 360, height: 800 },
        hasTouch: true,
      },
    },
    {
      name: "webkit-mobile",
      use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: "reduced-motion",
      use: {
        browserName: "chromium",
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      },
    },
  ],
});
