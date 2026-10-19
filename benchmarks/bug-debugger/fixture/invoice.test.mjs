import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotal } from "./src/invoice.mjs";

test("adds line amounts", () => {
  assert.equal(invoiceTotal(["₹12.50", "₹7.25"]), 19.75);
});
