export function parseAmount(text) {
  return parseInt(text.replace("₹", "").trim(), 10);
}
