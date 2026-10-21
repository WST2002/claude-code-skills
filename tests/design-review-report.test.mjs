import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderReport, validate } from "../skills/design-review/scripts/report.mjs";

const skill = path.resolve(import.meta.dirname, "../skills/design-review");
const example = path.join(skill, "examples", "checkout.png");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "design-review-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const review = () => JSON.parse(fs.readFileSync(path.join(skill, "examples", "checkout-review.json"), "utf8"));

test("the example review is valid and every pin is on the image", () => {
  const data = review();
  validate(data);
  assert.equal(data.findings.length, 10);
});

test("invalid reviews list every problem", () => {
  assert.throws(
    () => validate({ title: "x", verdict: "y", image: "a.png", findings: [{ severity: "Huge", x: 120, y: 5, where: "w", problem: "p" }] }),
    /findings\[0\]\.severity must be one of Blocker, Major, Minor, Polish; findings\[0\]\.x must be a percentage from 0 to 100; findings\[0\]\.fix is missing/,
  );
});

test("the report pins every finding and escapes text", () => {
  const data = review();
  data.findings[0].problem = '<img src=x onerror="alert(1)">';
  const html = renderReport(data, "data:image/png;base64,AA==");
  assert.equal((html.match(/class="pin /g) ?? []).length, 10);
  assert.match(html, /style="left:94\.9%;top:77\.1%"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /<li>2 Blocker<\/li>/);
});

test("report CLI writes one shareable file with the screenshot inside", (t) => {
  const dir = tempDir(t);
  fs.copyFileSync(example, path.join(dir, "checkout.png"));
  fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review()));
  const result = spawnSync(process.execPath, [path.join(skill, "scripts", "report.mjs"), path.join(dir, "review.json")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const html = fs.readFileSync(path.join(dir, "review.html"), "utf8");
  assert.match(html, /<img src="data:image\/png;base64,iVBOR/);
  assert.match(result.stdout, /Wrote .*review\.html \(10 findings\)/);
});
