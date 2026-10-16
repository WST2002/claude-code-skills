import { test } from "node:test";
import assert from "node:assert/strict";
import { branchName } from "../lib/branch-name.mjs";

test("bug labels make a fix branch with the id and a slug", () => {
  assert.equal(branchName({ id: "123", title: "Login returns 500 for emails with +", labels: ["bug"] }), "fix/123-login-returns-500-for-emails-with");
});

test("error words in the title also mean a fix", () => {
  assert.equal(branchName({ id: "PROJ-4", title: "Checkout crashes on empty cart", labels: [] }), "fix/proj-4-checkout-crashes-on-empty-cart");
});

test("wrong-behavior wording in the title means a fix", () => {
  for (const title of ["Cart total ignores item quantity", "Shows 100 instead of 200", "Search does not return results", "Cannot upload avatar", "Incorrect tax on invoices"]) {
    assert.match(branchName({ title, labels: [] }), /^fix\//, title);
  }
});

test("everything else is a feature", () => {
  assert.equal(branchName({ id: "77", title: "Add CSV export to orders", labels: ["enhancement"] }), "feat/77-add-csv-export-to-orders");
});

test("free text has no id", () => {
  assert.equal(branchName({ title: "Dark mode toggle", labels: [] }), "feat/dark-mode-toggle");
});

test("slugs are ASCII, at most 40 characters, and do not end with a hyphen", () => {
  const name = branchName({ id: "1", title: "Ünïcödé — très long titre qui dépasse largement la limite autorisée", labels: [] });
  const slug = name.replace("feat/1-", "");
  assert.match(slug, /^[a-z0-9-]+$/);
  assert.ok(slug.length <= 40);
  assert.ok(!slug.endsWith("-"));
});

test("an existing branch gets a numeric suffix", () => {
  const existing = ["fix/5-broken-login", "fix/5-broken-login-2"];
  assert.equal(branchName({ id: "5", title: "Broken login", labels: ["bug"] }, existing), "fix/5-broken-login-3");
});
