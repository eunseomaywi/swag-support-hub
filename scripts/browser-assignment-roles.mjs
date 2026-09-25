import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import WebSocket from "ws";

// Only the isolated local project; no production credentials, requests, or mail.
const raw = execFileSync(
  "npx",
  ["supabase", "status", "--workdir", "/private/tmp/swag-assignment-isolated", "--output", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
const status = JSON.parse(raw);
assert.equal(status.API_URL, "http://127.0.0.1:55321");
const key = status.SERVICE_ROLE_KEY;
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_swag-assignment-isolated",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const password = `Fixture-${randomBytes(18).toString("hex")}!`,
  users = [],
  requestIds = [randomUUID(), randomUUID(), randomUUID()];
let server, chrome, ws;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  for (const role of ["teacher", "peer_mentor", "swag_member"]) {
    const email = `${role}.${randomUUID()}@example.invalid`;
    const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Fixture ${role}` },
      }),
    });
    assert.equal(response.status, 200);
    const user = await response.json();
    users.push({ id: user.id, role, email });
    sql(
      `select public.admin_set_staff_registration('${user.id}','${role}',true);update public.profiles set year_group=${role === "teacher" ? "null" : "'Year 12'"} where id='${user.id}';`,
    );
  }
  sql(
    `insert into public.peer_support_requests(id,student_name,year_group,contact_email,category,preferred_date,preferred_time,preferred_periods,private_explanation) values ${requestIds.map((id) => `('${id}','Fixture Student','Year 9','fixture@example.invalid','Friendships',(now() at time zone 'Asia/Seoul')::date+2,'Break',array['break','lunch_1'],'Fixture private details')`).join(",")};`,
  );
  server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "8081"],
    {
      stdio: "ignore",
      env: {
        ...process.env,
        VITE_SUPABASE_URL: status.API_URL,
        VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
        VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        EMAIL_MODE: "disabled",
      },
    },
  );
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch("http://127.0.0.1:8081/login")).ok) break;
    } catch {}
    await pause(200);
  }
  const port = 9900 + Math.floor(Math.random() * 90);
  chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=/private/tmp/swag-roles-${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
      break;
    } catch {}
    await pause(100);
  }
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  let id = 0;
  const pending = new Map(),
    exceptions = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
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
    await call("Page.navigate", { url: `http://127.0.0.1:8081${path}` });
    await pause(1000);
  };
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setTimezoneOverride", { timezoneId: "America/Los_Angeles" });
  for (const user of users) {
    await navigate("/login");
    await evaluate("localStorage.clear()");
    await navigate("/login");
    await evaluate(
      `(()=>{const set=(id,value)=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};set('email',${JSON.stringify(user.email)});set('password',${JSON.stringify(password)});document.querySelector('form').requestSubmit();})()`,
    );
    await pause(1300);
    const base =
      user.role === "teacher" ? "teacher" : user.role === "peer_mentor" ? "peer-mentor" : "swag";
    assert.equal(await evaluate("location.pathname"), `/${base}/dashboard`);
    assert.ok((await evaluate("document.body.innerText")).includes(`Fixture ${user.role}`));
    for (const width of [375, 1440]) {
      await call("Emulation.setDeviceMetricsOverride", {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width === 375,
      });
      await navigate(`/${base}/${base === "teacher" ? "peer-support" : "requests"}`);
      const text = await evaluate("document.body.innerText");
      assert.match(text, /D-1일|D-2일/);
      assert.ok(text.includes("Break"));
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"));
      if (base === "teacher") {
        assert.ok(!text.includes("Fixture private details"));
        assert.ok(!text.includes("fixture@example.invalid"));
      }
    }
    if (user.role === "peer_mentor") {
      await navigate("/teacher/concerns");
      assert.ok((await evaluate("document.body.innerText")).includes("isn't available"));
    }
    if (user.role === "swag_member") {
      await navigate("/swag/concerns");
      assert.ok(!(await evaluate("document.body.innerText")).includes("isn't available"));
    }
  }
  // Prepare only a local Teacher assignment, then verify actual login return and case access.
  const teacher = users[0],
    peer = users[1];
  sql(
    `begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"${teacher.id}","role":"authenticated"}',true);select public.teacher_assign_peer_request('${requestIds[0]}','${peer.id}');commit;`,
  );
  await evaluate("localStorage.clear()");
  await navigate(`/peer-mentor/cases/${requestIds[0]}`);
  assert.equal(await evaluate("location.pathname"), "/login");
  await evaluate(
    `(()=>{const set=(id,value)=>{const el=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};set('email',${JSON.stringify(peer.email)});set('password',${JSON.stringify(password)});document.querySelector('form').requestSubmit();})()`,
  );
  await pause(1500);
  assert.equal(await evaluate("location.pathname"), `/peer-mentor/cases/${requestIds[0]}`);
  assert.ok((await evaluate("document.body.innerText")).includes("Fixture private details"));
  assert.deepEqual(exceptions, []);
  console.log(
    "Isolated authenticated Chrome: 3 roles, 375/1440px D-day in Los Angeles timezone, profile identity, Teacher list privacy, Concern access and login return-to passed. No emails sent.",
  );
} finally {
  ws?.close();
  chrome?.kill("SIGTERM");
  server?.kill("SIGTERM");
  const ids = requestIds.map((id) => `'${id}'`).join(",");
  sql(
    `delete from public.peer_assignment_email_outbox where request_id in (${ids});delete from public.peer_support_actions where request_id in (${ids});delete from public.peer_support_requests where id in (${ids});${users.length ? `delete from auth.users where id in (${users.map((u) => `'${u.id}'`).join(",")});` : ""}`,
  );
}
