import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import WebSocket from "ws";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const origin = process.env.SWAG_BROWSER_ORIGIN || "http://127.0.0.1:5173";
const port = 9300 + Math.floor(Math.random() * 400);
const profile = `/private/tmp/swag-phase5-cdp-${port}`;
const fixturePath = process.env.SWAG_BROWSER_FIXTURE_PATH;
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--disable-background-networking",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function assert(value, message) {
  if (!value) throw new Error(message);
}

async function target() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json(),
      );
      const page = targets.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome has not opened the debugging endpoint yet.
    }
    await pause(125);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

const ws = new WebSocket(await target());
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});
let nextId = 0;
const pending = new Map();
const exceptions = [];
ws.on("message", (raw) => {
  const message = JSON.parse(String(raw));
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") {
    exceptions.push(message.params?.exceptionDetails?.text || "runtime exception");
  }
});

function call(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path, delay = 900) {
  await call("Page.navigate", { url: `${origin}${path}` });
  await pause(delay);
}
async function screenshot(path) {
  const result = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function signIn(account) {
  await navigate("/login", 900);
  await evaluate(`(() => {
    const set = (selector, value) => {
      const input = document.querySelector(selector);
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor.set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('#email', ${JSON.stringify(account.email)});
    set('#password', ${JSON.stringify(account.password)});
    document.querySelector('form').requestSubmit();
  })()`);
  await pause(1800);
}

async function signOut() {
  await evaluate(`(() => {
    const menu = document.querySelector('[aria-label="Open dashboard menu"]');
    if (menu) menu.click();
  })()`);
  await pause(100);
  await evaluate(
    `([...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Sign out'))?.click()`,
  );
  await pause(1000);
}

try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate("/form/booking", 1400);
  const mobile = await evaluate(`({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    title: document.querySelector('h1')?.textContent,
    inputs: [...document.querySelectorAll('label')].map((node) => node.textContent?.trim()),
    menu: Boolean(document.querySelector('[aria-label="Open menu"]')),
    footer: document.body.innerText.includes('website by @eunseowi')
  })`);
  assert(mobile.width === 390, "Mobile CSS viewport was not 390px");
  assert(mobile.scrollWidth <= mobile.width, "Booking page has horizontal overflow at 390px");
  assert(mobile.title === "Peer Support Request", "Booking page heading is missing");
  assert(
    mobile.inputs.some((label) => label === "Name"),
    "Booking form did not load",
  );
  assert(mobile.menu && mobile.footer, "Mobile menu or footer is missing");
  await screenshot("/private/tmp/swag-phase5-booking-mobile-cdp.png");
  await evaluate(`document.querySelector('[aria-label="Open menu"]')?.click()`);
  await pause(100);
  assert(
    await evaluate(`Boolean(document.querySelector('#mobile-nav'))`),
    "Mobile menu did not open",
  );
  await evaluate(`document.querySelector('#mobile-nav a[href="/form"]')?.click()`);
  await pause(300);
  assert(
    !(await evaluate(`Boolean(document.querySelector('#mobile-nav'))`)),
    "Mobile menu did not close after navigation",
  );

  await navigate("/peer-mentor/availability", 1400);
  const legacyRedirect = await evaluate(`location.pathname`);
  assert(legacyRedirect === "/login", "Legacy protected route did not end at sign-in");
  assert(
    !(await evaluate(
      `document.body.innerText.includes('Synthetic') || document.body.innerText.includes('@swag.local')`,
    )),
    "Unauthenticated route exposed local case data",
  );

  if (fixturePath && existsSync(fixturePath)) {
    const accounts = JSON.parse(await readFile(fixturePath, "utf8"));
    const peer = accounts.find((account) => account.role === "peer_mentor");
    const swag = accounts.find((account) => account.role === "swag_member");
    const teacher = accounts.find((account) => account.role === "teacher");
    assert(peer && swag && teacher, "Role fixtures are incomplete");

    await signIn(peer);
    assert(
      (await evaluate(`location.pathname`)) === "/peer-mentor/dashboard",
      "Peer Mentor dashboard routing failed",
    );
    await evaluate(`document.querySelector('[aria-label="Open dashboard menu"]')?.click()`);
    await pause(100);
    const peerNavigation = await evaluate(`document.body.innerText`);
    assert(
      peerNavigation.includes("Available Requests") && peerNavigation.includes("My Cases"),
      "Peer Mentor navigation is incomplete",
    );
    assert(!peerNavigation.includes("Concerns"), "Peer Mentor received Concern navigation");
    await navigate("/teacher/peer-support", 700);
    assert(
      (await evaluate(`document.body.innerText`)).includes("isn't available to your account"),
      "Wrong-role Teacher route was not blocked",
    );
    await signOut();

    await signIn(swag);
    assert(
      (await evaluate(`location.pathname`)) === "/swag/dashboard",
      "SWAG Member dashboard routing failed",
    );
    await evaluate(`document.querySelector('[aria-label="Open dashboard menu"]')?.click()`);
    await pause(100);
    const swagNavigation = await evaluate(`document.body.innerText`);
    assert(
      swagNavigation.includes("Available Requests") &&
        swagNavigation.includes("My Cases") &&
        swagNavigation.includes("Concerns") &&
        swagNavigation.includes("Escalations"),
      "SWAG Member navigation is incomplete",
    );
    await signOut();

    await signIn(teacher);
    assert(
      (await evaluate(`location.pathname`)) === "/teacher/dashboard",
      "Teacher dashboard routing failed",
    );
    await navigate("/teacher/peer-support", 900);
    const teacherOverview = await evaluate(`document.body.innerText`);
    assert(
      teacherOverview.includes("Peer Support Overview") &&
        teacherOverview.includes("School appointment settings"),
      "Teacher Overview did not load",
    );
    assert(
      teacherOverview.includes("Email: not configured (disabled)"),
      "Email readiness was not shown honestly",
    );
  }

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate("/form/booking", 1000);
  const desktop = await evaluate(
    `({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth })`,
  );
  assert(
    desktop.width === 1440 && desktop.scrollWidth <= desktop.width,
    "Desktop booking layout overflowed",
  );
  await screenshot("/private/tmp/swag-phase5-booking-desktop-cdp.png");
  assert(exceptions.length === 0, `Browser runtime exceptions: ${exceptions.join(", ")}`);
  process.stdout.write(
    `Browser smoke checks: ${fixturePath ? 23 : 12} passed (desktop and 390px mobile)\n`,
  );
} finally {
  ws.close();
  chrome.kill("SIGTERM");
}
