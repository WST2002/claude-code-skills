import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite, SITE_URL } from "../site/build.mjs";
import { CATEGORIES } from "../site/categories.mjs";

const root = path.resolve(import.meta.dirname, "..");
const skillNames = fs.readdirSync(path.join(root, "skills"));
const pluginNames = fs.readdirSync(path.join(root, "plugins"));

function built(t) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  buildSite(out);
  return (rel) => fs.readFileSync(path.join(out, rel), "utf8");
}

test("every skill belongs to exactly one category", () => {
  const listed = CATEGORIES.flatMap((c) => c.skills);
  assert.deepEqual([...listed].sort(), [...skillNames].sort());
  assert.equal(new Set(listed).size, listed.length);
});

test("every skill and plugin gets an SEO-ready page", (t) => {
  const read = built(t);
  for (const name of skillNames) {
    const html = read(`skills/${name}/index.html`);
    assert.match(html, /<title>[^<]+ — Claude Code Skill<\/title>/, name);
    assert.match(html, /<meta name="description" content="[^"]{40,}"/, name);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE_URL}/skills/${name}/">`), name);
    assert.match(html, new RegExp(`npx skills add WST2002/claude-code-skills --skill ${name}`), name);
    assert.match(html, /application\/ld\+json/, name);
    assert.doesNotMatch(html, /^---\nname:/m, name);
  }
  for (const name of pluginNames) {
    assert.match(read(`plugins/${name}/index.html`), /— Claude Code Plugin<\/title>/, name);
  }
});

test("every page has exactly one h1 and readable names", (t) => {
  const read = built(t);
  for (const rel of ["index.html", ...skillNames.map((n) => `skills/${n}/index.html`), ...pluginNames.map((n) => `plugins/${n}/index.html`)]) {
    assert.equal((read(rel).match(/<h1[\s>]/g) ?? []).length, 1, rel);
  }
  assert.match(read("plugins/issue-to-pr/index.html"), /<h1>Issue to PR<\/h1>/);
  assert.match(read("plugins/proof-of-done/index.html"), /<h1>Proof of Done<\/h1>/);
});

test("relative links in skills point to the files on GitHub", (t) => {
  const html = built(t)("skills/security-audit/index.html");
  assert.match(html, /href="https:\/\/github\.com\/WST2002\/claude-code-skills\/blob\/main\/skills\/security-audit\/checklist\.md"/);
});

test("home page links every skill and plugin", (t) => {
  const html = built(t)("index.html");
  for (const name of [...skillNames, ...pluginNames]) assert.match(html, new RegExp(`/${name}/"`), name);
});

test("sitemap lists home, every skill and every plugin", (t) => {
  const xml = built(t)("sitemap.xml");
  assert.match(xml, new RegExp(`<loc>${SITE_URL}/</loc>`));
  for (const name of skillNames) assert.match(xml, new RegExp(`<loc>${SITE_URL}/skills/${name}/</loc>`));
  for (const name of pluginNames) assert.match(xml, new RegExp(`<loc>${SITE_URL}/plugins/${name}/</loc>`));
});

test("home page links to the benchmarks", (t) => {
  const html = built(t)("index.html");
  assert.match(html, /href="https:\/\/github\.com\/WST2002\/claude-code-skills\/tree\/main\/benchmarks"/);
  assert.match(html, /Tested with answer keys/);
});
