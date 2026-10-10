import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

test("charter signing, private persistence, moderation, polling and navigation", async ({
  page,
  baseURL,
}, testInfo) => {
  if (baseURL !== "http://127.0.0.1:4175")
    throw new Error("Fixture writes require the isolated local app.");
  const config = JSON.parse(
    execFileSync(
      "npx",
      ["supabase", "status", "--workdir", "/private/tmp/swag-charter-validation", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  if (config.API_URL !== "http://127.0.0.1:56321") throw new Error("Local DB required");
  const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("challenges.cloudflare.com"))
      errors.push(msg.text());
  });
  await page.goto("/charter");
  await expect(page).toHaveTitle("Kindness & Respect Charter — SWAG");
  const artwork = page.locator(".charter-canvas");
  await expect(artwork).toHaveAttribute("data-animation-state", "idle", { timeout: 15_000 });
  await expect(page.locator("body")).not.toContainText(
    /\b(?:980|982)\b|preview signatures|\d+ signatures|\d+ people|signatures now in the artwork/i,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `/private/tmp/charter-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (page.viewportSize()!.width < 1024) {
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await expect(
      page.locator("#mobile-nav").getByRole("link", { name: "Charter", exact: true }),
    ).toHaveAttribute("data-status", "active");
    await page.locator("#mobile-nav").getByRole("link", { name: "Charter", exact: true }).click();
    await expect(page.locator("#mobile-nav")).toHaveCount(0);
  } else
    await expect(
      page
        .getByRole("navigation", { name: "Main", exact: true })
        .getByRole("link", { name: "Charter", exact: true }),
    ).toHaveAttribute("data-status", "active");
  await page.getByRole("button", { name: "Replay logo", exact: true }).click();
  await expect(artwork).toHaveAttribute("data-animation-state", "idle", { timeout: 10_000 });
  const open = page.getByRole("button", { name: "Read & sign the charter", exact: true });
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const reading = page.getByLabel("Kindness and respect charter", { exact: true });
  await expect(reading.getByText("INCLUDE OTHERS.", { exact: true })).toBeVisible();
  const box = await reading.boundingBox();
  expect(box!.height).toBeGreaterThan(100);
  const agreement = page.getByRole("checkbox", {
    name: "I have read the charter and will help uphold kindness and respect in our community.",
  });
  const needsScroll = await reading.evaluate((el) => el.scrollHeight > el.clientHeight + 2);
  if (needsScroll) await expect(agreement).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await reading.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  await expect(agreement).toBeEnabled();
  await agreement.check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const pad = page.getByLabel("Draw your signature", { exact: true });
  const draw = async () => {
    const r = (await pad.boundingBox())!;
    if (testInfo.project.use.hasTouch && testInfo.project.use.browserName === "chromium") {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: r.x + r.width * 0.15, y: r.y + r.height * 0.65, force: 0.5 }],
      });
      for (let i = 1; i <= 24; i++)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: r.x + r.width * (0.15 + i * 0.025),
              y: r.y + r.height * (0.45 + Math.sin(i * 0.85) * 0.28),
              force: 0.5,
            },
          ],
        });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await touch.detach();
      return;
    }
    await page.mouse.move(r.x + r.width * 0.15, r.y + r.height * 0.65);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++)
      await page.mouse.move(
        r.x + r.width * (0.15 + i * 0.025),
        r.y + r.height * (0.45 + Math.sin(i * 0.85) * 0.28),
      );
    await page.mouse.up();
  };
  await draw();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await draw();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeDisabled();
  await draw();
  await page
    .getByRole("checkbox", { name: "I agree to add this signature to the shared SWAG artwork." })
    .check();
  const submit = page.getByRole("button", { name: "Add my signature", exact: true });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  const posted = page.waitForRequest(
    (r) => r.url().endsWith("/api/charter/signatures") && r.method() === "POST",
  );
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/charter/signatures") && r.request().method() === "POST",
  );
  await submit.click();
  const payload = (await posted).postDataJSON();
  const resultResponse = await response;
  expect(resultResponse.status(), await resultResponse.text()).toBe(201);
  const result = await resultResponse.json();
  await expect(page.getByText("You are part of the mark.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your colour:/)).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText(
    /\d+ signatures|\d+ people|signatures now/i,
  );
  const stored = await service
    .from("charter_signatures")
    .select("id,status,strokes,region_id")
    .eq("id", result.id)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data!.status).toBe("pending");
  expect(stored.data!.strokes).toEqual(payload.strokes);
  expect((await anon.from("charter_signatures").select("id").eq("id", result.id)).data).toEqual([]);
  const duplicate = await page.request.post("/api/charter/signatures", {
    headers: { origin: baseURL!, "content-type": "application/json" },
    data: { ...payload, turnstileToken: "XXXX.DUMMY.TOKEN.XXXX" },
  });
  expect(duplicate.status(), await duplicate.text()).toBe(201);
  expect((await duplicate.json()).id).toBe(result.id);
  expect(
    (
      await service
        .from("charter_signatures")
        .select("id")
        .eq("client_submission_id", payload.client_submission_id)
    ).data,
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Watch my signature join", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(artwork).toHaveAttribute("data-animation-state", "idle", { timeout: 10_000 });
  const email = `charter-${randomUUID()}@example.invalid`,
    password = randomUUID() + "Aa9!";
  const user = await service.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull();
  expect(
    (
      await service.rpc("admin_set_staff_registration", {
        p_profile_id: user.data.user!.id,
        p_role: "teacher",
        p_booking_enabled: true,
      })
    ).error,
  ).toBeNull();
  const staff = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  expect((await staff.auth.signInWithPassword({ email, password })).error).toBeNull();
  expect(
    (await staff.rpc("moderate_charter_signature", { p_id: result.id, p_status: "approved" }))
      .error,
  ).toBeNull();
  expect(
    (await anon.from("charter_signatures").select("id").eq("id", result.id)).data,
  ).toHaveLength(1);
  await page.reload();
  await expect(artwork).toHaveAttribute("data-animation-state", "idle", { timeout: 15_000 });
  // Manifest polling fetches newly approved IDs and notices a later hide without navigation.
  const manifest = await page.request.post(
    `${config.API_URL}/rest/v1/rpc/charter_public_manifest`,
    { headers: { apikey: config.ANON_KEY, "Content-Type": "application/json" }, data: {} },
  );
  expect((await manifest.json()).some((r: { id: string }) => r.id === result.id)).toBe(true);
  const refresh = page.waitForResponse((r) => r.url().includes("/rpc/charter_public_manifest"), {
    timeout: 50_000,
  });
  expect(
    (await staff.rpc("moderate_charter_signature", { p_id: result.id, p_status: "hidden" })).error,
  ).toBeNull();
  const updated = await refresh;
  expect((await updated.json()).some((r: { id: string }) => r.id === result.id)).toBe(false);
  expect(errors).toEqual([]);
  await service
    .from("staff_members")
    .update({ booking_enabled: false })
    .eq("profile_id", user.data.user!.id);
  await service.from("profiles").update({ role: "student" }).eq("id", user.data.user!.id);
});

test("rotation, focus trap, scroll restoration and all-content-fits reading", async ({ page }) => {
  await page.goto("/charter");
  await page.getByRole("button", { name: "Read & sign the charter", exact: true }).click();
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  expect((await page.locator(".charter-reading").boundingBox())!.height).toBeGreaterThanOrEqual(
    100,
  );
  await page.keyboard.press("Tab");
  for (let i = 0; i < 10; i++) await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1600 });
  // Exercise the same reader when all content fits, without a scroll event.
  await page.addStyleTag({ content: ".charter-dialog-read { height: 1200px !important; }" });
  const reading = page.locator(".charter-reading");
  await expect
    .poll(() => reading.evaluate((el) => el.scrollHeight <= el.clientHeight + 2))
    .toBe(true);
  expect(await reading.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.getByRole("checkbox", { name: /I have read the charter/ })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize(original);
  await page
    .getByRole("button", { name: "Read & sign the charter", exact: true })
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: "Read & sign the charter", exact: true })
    .evaluate((el) => el.focus({ preventScroll: true }));
  const before = await page.evaluate(() => scrollY);
  // Keyboard activation avoids Playwright centering the button before a pointer click.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(before);
});
