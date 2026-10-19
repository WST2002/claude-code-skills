export async function createOrder(order: unknown) {
  const res = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
  return res.json();
}
