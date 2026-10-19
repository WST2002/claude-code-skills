import { parseAmount } from "./parse.mjs";

export function invoiceTotal(lines) {
  return lines.map(parseAmount).reduce((a, b) => a + b, 0);
}
