import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

// Public browser only. --submit adds one anonymous, pending smoke-test mark through Turnstile.
const submitLive = process.argv.includes("--submit");
const browser = await chromium.launch({
  channel: "chrome",
  headless: !process.argv.includes("--headed"),
});
const errors = [];
const report = { pages: [], viewports: [], submission: null, errors };
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    for (const path of [
      "/",
      "/what-is-swag",
      "/members",
      "/activities",
      "/peer-mentor",
      "/form",
      "/charter",
    ]) {
      const response = await page.goto(`https://nlcsswag.com${path}`);
      assert.equal(response.status(), 200, path);
      await expect(page.locator("header")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      assert.ok(await page.locator("main").innerText(), path);
      report.pages.push({ path, viewport: viewport.width, status: response.status() });
    }
    await expect(page).toHaveTitle("Kindness & Respect Charter — SWAG");
    const canvas = page.locator(".charter-canvas");
    await expect(canvas).toHaveAttribute("data-animation-state", "idle", { timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(
      /\b(?:980|982)\b|preview signatures|\d+ signatures|\d+ people|signatures now in the artwork/i,
    );
    if (viewport.width < 1024) {
      await page.getByRole("button", { name: "Open menu", exact: true }).click();
      await page.locator("#mobile-nav").getByRole("link", { name: "Charter", exact: true }).click();
      await expect(page.locator("#mobile-nav")).toHaveCount(0);
    } else {
      const tab = page
        .getByRole("navigation", { name: "Main", exact: true })
        .getByRole("link", { name: "Charter", exact: true });
      await expect(tab).toHaveAttribute("data-status", "active");
      await tab.click();
    }
    await page.getByRole("button", { name: "Replay logo", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-animation-state", "idle", { timeout: 15_000 });
    await page.screenshot({
      path: `/private/tmp/charter-production-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Read & sign the charter", exact: true }).click();
    const reading = page.locator(".charter-reading");
    await expect(reading.getByText("INCLUDE OTHERS.", { exact: true })).toBeVisible();
    assert.ok((await reading.boundingBox()).height > 100);
    await reading.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.getByRole("checkbox", { name: /I have read the charter/ }).check();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const pad = page.getByLabel("Draw your signature", { exact: true });
    const r = await pad.boundingBox();
    await page.mouse.move(r.x + r.width * 0.15, r.y + r.height * 0.6);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++)
      await page.mouse.move(
        r.x + r.width * (0.15 + i * 0.025),
        r.y + r.height * (0.45 + Math.sin(i * 0.85) * 0.28),
      );
    await page.mouse.up();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    await page
      .getByRole("checkbox", { name: "I agree to add this signature to the shared SWAG artwork." })
      .check();
    if (submitLive && viewport.width === 1440) {
      const submit = page.getByRole("button", { name: "Add my signature", exact: true });
      await expect(submit).toBeEnabled({ timeout: 60_000 });
      const response = page.waitForResponse((res) => res.url().endsWith("/api/charter/signatures"));
      await submit.click();
      const result = await response;
      assert.equal(result.status(), 201, await result.text());
      const receipt = await result.json();
      report.submission = { id: receipt.id, region: receipt.region_id, status: result.status() };
      await expect(page.getByText("You are part of the mark.", { exact: true })).toBeVisible();
      await expect(page.getByRole("dialog")).not.toContainText(
        /\d+ signatures|\d+ people|signatures now/i,
      );
      await page.getByRole("button", { name: "Watch my signature join", exact: true }).click();
      await expect(canvas).toHaveAttribute("data-animation-state", "idle", { timeout: 10_000 });
      await page.reload();
      await expect(canvas).toHaveAttribute("data-animation-state", "idle", { timeout: 15_000 });
    } else await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Replay logo", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-animation-state", "idle");
    report.viewports.push({ ...viewport, passed: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
