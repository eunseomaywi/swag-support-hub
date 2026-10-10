import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHARTER_VERSION,
  LIMITS,
  normalizeStrokes,
  pathLength,
  validateStrokes,
  validateSubmission,
} from "../src/lib/charter/model.ts";
import {
  handleCharterRequest,
  readBoundedJson,
  type CharterGateway,
} from "../src/lib/charter/submission.server.ts";
const strokes = [
  [
    [0.1, 0.2, 0.5],
    [0.4, 0.8, 0.9],
    [0.8, 0.2, 0.1],
  ],
];
const body = {
  strokes,
  client_submission_id: "12345678-1234-4123-8123-123456789012",
  charter_version: CHARTER_VERSION,
  consent: true,
  turnstileToken: "fixture",
};
test("normalization bounds coordinates, retains pressure/endpoints and resamples", () => {
  const input = [
    Array.from(
      { length: 9000 },
      (_, i) => [i / 8999, Math.sin(i) / 2 + 0.5, 0.75] as [number, number, number],
    ),
  ];
  const result = normalizeStrokes(input);
  assert.ok(result[0]!.length <= LIMITS.points);
  assert.equal(result[0]![0]![2], 0.75);
  assert.equal(result[0]!.at(-1)![0], 1);
  assert.deepEqual(
    normalizeStrokes([
      [
        [-1, 2],
        [0.5, 0.5],
      ],
    ]),
    [
      [
        [0, 1],
        [0.5, 0.5],
      ],
    ],
  );
});
test("reject short paths, malformed points, excessive strokes and points", () => {
  assert.ok(pathLength(strokes as [number, number, number][][]) > 0.35);
  for (const value of [
    [],
    [
      [
        [0, 0],
        [0.01, 0.01],
      ],
    ],
    [
      [
        [0, 0],
        [Infinity, 0],
      ],
    ],
    [
      [
        [0, 0],
        [0, 2],
      ],
    ],
    [
      [
        [0, 0],
        [1, 1, "x"],
      ],
    ],
    [
      [
        [0, 0],
        [1, 1, 0.5, 0],
      ],
    ],
    Array(33).fill(strokes[0]),
    [Array(1601).fill([0, 0])],
  ])
    assert.throws(() => validateStrokes(value));
  assert.deepEqual(validateStrokes(strokes), strokes);
});
test("submission requires current charter, consent and UUID", () => {
  assert.equal(validateSubmission(body).client_submission_id, body.client_submission_id);
  for (const change of [
    { consent: false },
    { charter_version: "old" },
    { client_submission_id: "bad" },
  ])
    assert.throws(() => validateSubmission({ ...body, ...change }));
});
test("bounded reader rejects streamed oversized data without content length", async () => {
  await assert.rejects(
    readBoundedJson(
      new Request("https://example.com", { method: "POST", body: "x".repeat(LIMITS.bytes + 1) }),
    ),
    /payload_too_large/,
  );
});
function req(path: string, payload: unknown, cookie = "") {
  return new Request(`https://nlcsswag.com/api/charter/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://nlcsswag.com", cookie },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}
function gateway(): CharterGateway {
  return {
    secret: "local-fixture-secret",
    originAllowed: (r) => r.headers.get("origin") === new URL(r.url).origin,
    verifyTurnstile: async () => true,
    rpc: async () => ({
      ok: true,
      status: 200,
      data: [{ id: body.client_submission_id, region_id: "orange", created_at: "2026-10-10" }],
    }),
  };
}
test("API requires signed cookie, origin, content type; valid request returns safe receipt", async () => {
  const g = gateway();
  assert.equal((await handleCharterRequest(req("signatures", body), g)).status, 403);
  const session = await handleCharterRequest(req("session", {}), g);
  const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
  assert.match(cookie, /swag_charter_session=/);
  assert.match(session.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict/);
  const response = await handleCharterRequest(req("signatures", body, cookie), g);
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(await response.json()).sort(), ["created_at", "id", "region_id"]);
  assert.equal((await handleCharterRequest(req("signatures", "{broken", cookie), g)).status, 400);
  assert.equal(
    (
      await handleCharterRequest(
        req(
          "signatures",
          {
            ...body,
            strokes: [
              [
                [0, 0],
                [0.01, 0.01],
              ],
            ],
          },
          cookie,
        ),
        g,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handleCharterRequest(req("signatures", "x".repeat(70000), cookie), g)).status,
    413,
  );
  assert.equal(
    (
      await handleCharterRequest(req("signatures", body, cookie), {
        ...g,
        originAllowed: () => false,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await handleCharterRequest(req("signatures", body, cookie), {
        ...g,
        verifyTurnstile: async () => false,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await handleCharterRequest(req("signatures", body, cookie), {
        ...g,
        rpc: async () => ({ ok: false, status: 400, data: null }),
      })
    ).status,
    400,
  );
});
import { assignSlots, decorativeStrokes } from "../src/lib/charter/slots.ts";
import type { PublicSignature } from "../src/lib/charter/model.ts";
import { regionCapacities, LOGO_REGIONS } from "../src/lib/charter/logo.ts";
test("canonical regions preserve density and decorative handwriting varies deterministically", () => {
  for (const density of [500, 980]) {
    const capacities = regionCapacities(density);
    assert.equal(
      Object.values(capacities).reduce((sum, n) => sum + n, 0),
      density,
    );
    assert.equal(Object.keys(capacities).length, 6);
    for (const region of LOGO_REGIONS) assert.ok(capacities[region.id] > 0);
  }
  const gestures = Array.from({ length: 30 }, (_, i) =>
    JSON.stringify(decorativeStrokes(`sample-${i}`)),
  );
  assert.equal(new Set(gestures).size, gestures.length);
});
test("deterministic slots replace matching decorative regions without changing density", () => {
  const targets = Array.from({ length: 20 }, (_, i) => ({
    key: String(i),
    region: i < 10 ? ("orange" as const) : ("blue" as const),
    x: i / 20,
    y: 0.5,
  }));
  const signature: PublicSignature = {
    id: body.client_submission_id,
    region_id: "orange",
    strokes: strokes as [number, number, number][][],
    created_at: "2026-10-10",
  };
  const empty = assignSlots(targets, []),
    filled = assignSlots(targets, [signature]);
  assert.equal(empty.length, filled.length);
  assert.equal(filled.filter((slot) => slot.signature).length, 1);
  assert.equal(filled.find((slot) => slot.signature)!.region, "orange");
  assert.deepEqual(assignSlots(targets, [signature]), filled);
  const previous = new Map([[signature.id, filled.find((slot) => slot.signature)!.key]]);
  const next = assignSlots(targets, [signature, { ...signature, id: "additional-id" }], previous);
  assert.equal(
    next.find((slot) => slot.signature?.id === signature.id)!.key,
    previous.get(signature.id),
  );
  assert.deepEqual(decorativeStrokes("a"), decorativeStrokes("a"));
  assert.equal(
    assignSlots(
      targets,
      Array.from({ length: 30 }, (_, i) => ({ ...signature, id: String(i) })),
    ).filter((slot) => slot.signature).length,
    10,
  );
});
