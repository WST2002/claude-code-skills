import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTicketRef } from "../lib/ticket-ref.mjs";

test("issue numbers refer to the current repository", () => {
  assert.deepEqual(parseTicketRef("123"), { kind: "github", number: 123, repo: null });
  assert.deepEqual(parseTicketRef("#45"), { kind: "github", number: 45, repo: null });
});

test("GitHub issue URLs carry their repository", () => {
  assert.deepEqual(parseTicketRef("https://github.com/acme/shop/issues/9"), { kind: "github", number: 9, repo: "acme/shop" });
  assert.deepEqual(parseTicketRef("github.com/acme/shop/issues/9#issuecomment-1"), { kind: "github", number: 9, repo: "acme/shop" });
});

test("pull request URLs are rejected with a reason", () => {
  assert.deepEqual(parseTicketRef("https://github.com/acme/shop/pull/7"), { kind: "invalid", reason: "That is a pull request, not an issue." });
});

test("Jira keys are recognised", () => {
  assert.deepEqual(parseTicketRef("PROJ-45"), { kind: "jira", key: "PROJ-45" });
  assert.deepEqual(parseTicketRef("prm2-1029"), { kind: "jira", key: "PRM2-1029" });
});

test("anything else is a free-text description", () => {
  const text = "Login returns 500 when the email has a plus sign";
  assert.deepEqual(parseTicketRef(`"${text}"`), { kind: "text", text });
  assert.deepEqual(parseTicketRef(text), { kind: "text", text });
});

test("empty input is invalid", () => {
  assert.deepEqual(parseTicketRef("   "), { kind: "invalid", reason: "Give an issue number, an issue URL, a Jira key or a description." });
});
