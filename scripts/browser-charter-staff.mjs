import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
const config = JSON.parse(
  execFileSync(
    "npx",
    ["supabase", "status", "--workdir", "/private/tmp/swag-charter-validation", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
assert.equal(config.API_URL, "http://127.0.0.1:56321");
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const browser = await chromium.launch({ channel: "chrome" });
let checks = 0;
const errors = [];
try {
  for (const role of ["swag_member", "teacher", "peer_mentor", "student"]) {
    const email = `charter-ui-${randomUUID()}@example.invalid`,
      password = randomUUID() + "Aa9!";
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(error);
    if (role !== "student")
      assert.ifError(
        (
          await service.rpc("admin_set_staff_registration", {
            p_profile_id: data.user.id,
            p_role: role,
            p_booking_enabled: true,
          })
        ).error,
      );
    assert.ifError(
      (
        await service
          .from("profiles")
          .update({
            full_name: "Charter local fixture",
            year_group: role === "teacher" ? null : "Year 12",
          })
          .eq("id", data.user.id)
      ).error,
    );
    const auth = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
    const login = await auth.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(
      ({ session }) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)),
      { session: login.data.session },
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    if (role === "student" || role === "peer_mentor") {
      await page.goto("http://127.0.0.1:4175/swag/charter");
      await page.getByText("isn't available to your account", { exact: false }).waitFor();
      checks++;
      await context.close();
      await service
        .from("staff_members")
        .update({ booking_enabled: false })
        .eq("profile_id", data.user.id);
      await service.from("profiles").update({ role: "student" }).eq("id", data.user.id);
      continue;
    }
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      ids.push(id);
      assert.ifError(
        (
          await service.from("charter_signatures").insert({
            id,
            client_submission_id: randomUUID(),
            strokes: [
              [
                [0.1, 0.1],
                [0.8, 0.8],
              ],
            ],
            region_id: "teal",
            charter_version: "2026-10-10",
            point_count: 2,
          })
        ).error,
      );
    }
    await page.goto(`http://127.0.0.1:4175/${role === "teacher" ? "teacher" : "swag"}/charter`);
    await page.getByRole("heading", { name: "Charter signatures", exact: true }).waitFor();
    await page.getByRole("button", { name: "Approve", exact: true }).first().click();
    await page.getByRole("button", { name: "Reject", exact: true }).first().click();
    await page.getByRole("button", { name: "Approved", exact: true }).click();
    if (role === "teacher") {
      await page.getByRole("button", { name: "Hide", exact: true }).first().click();
      checks++;
    } else {
      await page.waitForTimeout(200);
      assert.equal(await page.getByRole("button", { name: "Hide", exact: true }).count(), 0);
      checks++;
    }
    await page.screenshot({ path: `/private/tmp/charter-staff-${role}.png` });
    const states = await service.from("charter_signatures").select("status").in("id", ids);
    assert.ifError(states.error);
    assert.ok(states.data.some((r) => r.status === "rejected"));
    assert.ok(states.data.some((r) => r.status === (role === "teacher" ? "hidden" : "approved")));
    checks += 2;
    await context.close();
    await service
      .from("staff_members")
      .update({ booking_enabled: false })
      .eq("profile_id", data.user.id);
    await service.from("profiles").update({ role: "student" }).eq("id", data.user.id);
  }
  assert.deepEqual(errors, []);
  console.log(`Staff browser checks: ${checks} passed; no page errors.`);
} finally {
  await browser.close();
}
