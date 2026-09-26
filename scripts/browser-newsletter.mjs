import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { newsletters } from "../src/content/newsletters.ts";
import { renderAssignmentEmail } from "../supabase/functions/_shared/assignment-email.ts";

const origin = process.env.SWAG_BROWSER_ORIGIN || "http://127.0.0.1:8080";
const expectNewsletter = process.env.SWAG_EXPECT_NEWSLETTER !== "false";
const port = 9600 + Math.floor(Math.random() * 200);
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--disable-background-networking",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=/private/tmp/swag-newsletter-${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      const page = pages.find((p) => p.type === "page");
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        break;
      }
    } catch {}
    await pause(100);
  }
  assert.ok(ws, "Chrome started");
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  let consoleErrorCount = 0;
  let hydrationErrorCount = 0;
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id) {
      const task = pending.get(m.id);
      if (task) {
        pending.delete(m.id);
        m.error ? task.reject(new Error(m.error.message)) : task.resolve(m.result);
      }
    }
    if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrorCount++;
      if (
        m.params.args.some((arg) =>
          /hydration|hydrated|server rendered|Minified React/i.test(
            arg.value || arg.description || "",
          ),
        )
      )
        hydrationErrorCount++;
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const navigate = async (path) => {
    await call("Page.navigate", { url: origin + path });
    await pause(1300);
  };
  await call("Page.enable");
  await call("Runtime.enable");
  for (const width of [375, 768, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width === 375,
    });
    await navigate("/activities");
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      `no overflow ${width}`,
    );
    const content = await evaluate("document.body.innerText");
    for (const title of [
      "Wellbeing Week",
      "Awareness Campaigns",
      "Peer Support",
      "website by @eunseowi",
    ])
      assert.ok(content.includes(title));
    if (expectNewsletter) {
      assert.equal(await evaluate("document.querySelectorAll('[data-activity-card]').length"), 6);
      for (const article of newsletters) {
        const image = await evaluate(
          `(async()=>{const img=document.querySelector('[data-activity-card="${article.id}"] img');img?.scrollIntoView();await img?.decode();return {complete:img?.complete,width:img?.naturalWidth,height:img?.naturalHeight,fit:img?getComputedStyle(img).objectFit:null};})()`,
        );
        assert.deepEqual(image, {
          complete: true,
          width: article.images[0].width,
          height: article.images[0].height,
          fit: "contain",
        });
        const response = await fetch(origin + article.images[0].src);
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type"), /^image\/png/);
        assert.deepEqual(
          [...new Uint8Array(await response.arrayBuffer()).slice(0, 8)],
          [137, 80, 78, 71, 13, 10, 26, 10],
        );
      }
      await evaluate("document.querySelector('[data-activity-card=peer-mentoring]').click()");
      await pause(400);
      assert.ok(await evaluate("location.search.includes('newsletter=peer-mentoring')"));
      for (let i = 0; i < 3; i++) {
        const text = await evaluate("document.querySelector('[role=dialog]').innerText");
        for (const value of [
          newsletters[i].title,
          ...newsletters[i].paragraphs,
          ...newsletters[i].tags,
          newsletters[i].subtitle,
          newsletters[i].sourceLabel,
          newsletters[i].contactText,
        ].filter(Boolean))
          assert.ok(text.includes(value), `DOM text: ${value.slice(0, 35)}`);
        assert.ok(text.includes(`${i + 1} / 3`));
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
        if (i === 0) {
          const image = await call("Page.captureScreenshot", { format: "png" });
          await writeFile(
            `/private/tmp/swag-newsletter-${width}.png`,
            Buffer.from(image.data, "base64"),
          );
        }
        if (i < 2) {
          await call("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "ArrowRight",
            code: "ArrowRight",
          });
          await pause(200);
        }
      }
      assert.ok(
        await evaluate(
          "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Next')).disabled",
        ),
      );
      await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await pause(300);
      assert.equal(await evaluate("document.querySelector('[role=dialog]') === null"), true);
      assert.equal(await evaluate("document.activeElement.dataset.activityCard"), "peer-mentoring");
      await navigate("/activities?newsletter=student-voice");
      assert.ok(
        (await evaluate("document.querySelector('[role=dialog]').innerText")).includes(
          newsletters[1].paragraphs[1],
        ),
      );
      await call("Page.reload");
      await pause(1000);
      assert.ok(await evaluate("Boolean(document.querySelector('[role=dialog]'))"));
      await navigate("/activities");
      await evaluate("document.querySelector('[data-activity-card=wellbeing-tips]').click()");
      await pause(250);
      await evaluate("history.back()");
      await pause(300);
      assert.equal(await evaluate("document.querySelector('[role=dialog]') === null"), true);
    } else {
      assert.equal(
        content.includes("SWAG Newsletter"),
        false,
        "missing images keep newsletter unpublished",
      );
    }
  }
  for (const path of [
    "/",
    "/login",
    "/form/booking",
    "/members",
    "/form/concern",
    "/peer-mentor/dashboard",
    "/swag/dashboard",
    "/teacher/dashboard",
  ]) {
    await navigate(path);
    assert.ok(await evaluate("document.body.innerText.includes('website by @eunseowi')"));
  }
  const casePath = "/peer-mentor/cases/92000000-0000-4000-8000-000000000001";
  await navigate(casePath);
  assert.equal(await evaluate("location.pathname"), "/login");
  assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"), casePath);
  const html = renderAssignmentEmail(
    {
      event_id: "fixture",
      request_id: "92000000-0000-4000-8000-000000000001",
      recipient_id: "fixture",
      recipient_address: "delivered@resend.dev",
      recipient_name: "Alex",
      recipient_role: "peer_mentor",
      preferred_date: "2026-09-29",
      preferred_periods: ["break", "lunch_1"],
      payload: null,
    },
    "notify@example.org",
    "https://swag-support-hub.mymaywi.workers.dev",
  ).html;
  await call("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate("/login");
  await evaluate(`document.open();document.write(${JSON.stringify(html)});document.close()`);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
  const email = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/private/tmp/swag-assignment-email-preview.png",
    Buffer.from(email.data, "base64"),
  );
  assert.deepEqual(exceptions, []);
  assert.equal(hydrationErrorCount, 0, "No hydration errors");
  console.log(
    JSON.stringify({
      origin,
      widths: [375, 768, 1440],
      newsletter: expectNewsletter
        ? "text/navigation/focus/history and all three decoded PNGs tested"
        : "unpublished (missing artwork)",
      publicRoutes: "passed",
      protectedRoutes: "unauthenticated redirect only",
      emailPreview: "synthetic fixture",
      exceptions: 0,
      consoleErrorCount,
      hydrationErrorCount,
    }),
  );
} finally {
  ws?.close();
  chrome.kill("SIGTERM");
}
