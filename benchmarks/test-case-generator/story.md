# Story: Apply a coupon at checkout

As a logged-in customer, I want to apply a coupon code at checkout so that I get a discount.

## Rules
- Coupon codes are 6–12 characters, letters and digits only, case-insensitive.
- A coupon can be percentage (1–50%) or fixed amount (₹50–₹2000).
- Minimum cart value to use any coupon: ₹500 (after other discounts).
- A coupon has an expiry date and time (IST). Expired coupons are rejected.
- Each customer can use a given coupon at most once.
- Only one coupon per order. Coupons cannot be combined.
- The discount can never make the total lower than ₹1.
- Guest users cannot apply coupons; they are asked to log in.
- If an item is removed and the cart drops below the minimum, the coupon is removed automatically and the customer is told why.
- Error messages: "Invalid code", "Coupon expired", "Minimum order ₹500", "Already used", "Log in to use coupons".
