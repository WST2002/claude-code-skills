import { test } from "node:test";
import assert from "node:assert/strict";
import { cartTotal } from "./src/cart.mjs";
test("sums prices", () => assert.equal(cartTotal([{ price: 10, quantity: 1 }]), 10));
