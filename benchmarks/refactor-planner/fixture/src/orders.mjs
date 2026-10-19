export function processOrder(order, user, inventory, mailer) {
  if (!order.items || order.items.length === 0) throw new Error("empty order");
  let subtotal = 0;
  for (const item of order.items) {
    const stock = inventory[item.sku];
    if (stock === undefined) throw new Error("unknown sku " + item.sku);
    if (stock < item.qty) throw new Error("out of stock " + item.sku);
    subtotal += item.price * item.qty;
  }
  let discount = 0;
  if (user.tier === "gold") discount = subtotal * 0.1;
  else if (user.tier === "silver") discount = subtotal * 0.05;
  if (order.coupon === "WELCOME" && user.orders === 0) discount += 100;
  let shipping = subtotal - discount >= 999 ? 0 : 49;
  if (user.country !== "IN") shipping = 1500;
  const total = Math.round(subtotal - discount + shipping);
  for (const item of order.items) inventory[item.sku] -= item.qty;
  const lines = order.items.map((i) => i.sku + " x" + i.qty).join(", ");
  mailer.send(user.email, "Order confirmed", "Items: " + lines + ". Total: " + total);
  return { subtotal, discount, shipping, total };
}
