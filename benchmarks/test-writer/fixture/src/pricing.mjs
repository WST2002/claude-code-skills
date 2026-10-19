export function shippingFee(subtotal, country) {
  if (subtotal < 0) throw new RangeError("subtotal must be >= 0");
  if (country !== "IN") return 1500;
  if (subtotal >= 999) return 0;
  return 49;
}

export function applyCoupon(subtotal, coupon) {
  if (!coupon) return subtotal;
  if (coupon.type === "percent") return Math.round(subtotal * (1 - coupon.value / 100));
  if (coupon.type === "flat") return Math.max(1, subtotal - coupon.value);
  throw new Error(`Unknown coupon type: ${coupon.type}`);
}