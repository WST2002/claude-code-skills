const db = require("./db");
const payments = require("./payments");

async function placeOrder(user, items) {
  const order = { userId: user.id, items };
  await db.saveOrder(order);
  return { ok: true };
}

async function chargeOrder(order) {
  await payments.charge(order.total, order.cardToken);
  order.status = "paid";
  return order;
}

function canDelete(user) {
  return user.isAdmin === true;
}

function shippingCity(user) {
  return user.profile ? user.profile.address.city : null;
}

async function findOrders(db, status) {
  return db.query("SELECT * FROM orders WHERE status = ?", [status]);
}

module.exports = { placeOrder, chargeOrder, canDelete, shippingCity, findOrders };
