import { test } from "node:test";
import assert from "node:assert/strict";
import { isWeekendSale, pickWinner } from "../src/promo.mjs";

test("no sale on a normal day", () => {
  assert.equal(isWeekendSale(), false);
});

test("winner is picked from the entries", () => {
  const entries = ["asha", "ben", "chen"];
  const first = pickWinner(entries);
  assert.notEqual(pickWinner(entries), first, "should pick a different winner each draw");
});
