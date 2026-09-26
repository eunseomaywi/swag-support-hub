import assert from "node:assert/strict";
import test from "node:test";
import { newsletters } from "../src/content/newsletters";
import { newsletterAssetsReady, newsletterImagePaths } from "../scripts/newsletter-assets.mjs";
import { existsSync } from "node:fs";
test("newsletter source order, uncorrected copy, labels, contact and actual text tags", () => {
  assert.deepEqual(
    newsletters.map((n) => n.sourcePage),
    [1, 2, 3],
  );
  assert.deepEqual(
    newsletters.map((n) => n.id),
    ["peer-mentoring", "student-voice", "wellbeing-tips"],
  );
  assert.equal(newsletters[0]?.sourceLabel, undefined);
  assert.match(newsletters[0]!.paragraphs[0]!, /cound not tell everything\./);
  assert.match(newsletters[0]!.paragraphs[1]!, /They will found out/);
  assert.equal(newsletters[0]?.contactText, "📩 EmailMs.Mcgibbon! (kmcgibbon@nlcsjeju.kr)");
  assert.equal(newsletters[0]?.contactHref, "mailto:kmcgibbon@nlcsjeju.kr");
  assert.deepEqual(
    newsletters.map((n) => n.paragraphs.length),
    [3, 2, 2],
  );
  assert.deepEqual(
    newsletters.map((n) => n.tags),
    [
      ["PeerMentoring", "GrowTogether"],
      ["Wellbeing Hub", "Advice"],
      ["Tips", "Wellbeing"],
    ],
  );
  assert.equal(newsletters[1]?.emphasizedParagraph, 1);
  for (const n of newsletters) {
    assert.equal(n.date, undefined);
    assert.equal(n.images[0]?.src, `/images/activities/newsletter/${n.id}.png`);
    assert.ok(n.images[0]?.alt);
  }
  assert.equal(newsletters[1]?.contactHref, undefined);
  assert.equal(newsletters[2]?.contactHref, undefined);
});
test("missing artwork cannot enable production newsletter", () => {
  if (newsletterImagePaths.some((p) => !existsSync(p)))
    assert.equal(newsletterAssetsReady(), false);
});
