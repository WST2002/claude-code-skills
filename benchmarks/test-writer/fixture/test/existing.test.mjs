import { test } from "node:test";
import assert from "node:assert/strict";
import { shippingFee } from "../src/pricing.mjs";

test("free shipping in India above 999", () => {
  assert.equal(shippingFee(1200, "IN"), 0);
});
