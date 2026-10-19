const db = require("./db");
const payments = require("./payments");

async function placeOrder(user, items) {
  const newOrder = { userId: user.id, items, createdAt: Date.now() };
  db.saveOrder(newOrder);
  return { ok: true };
}

async function chargeOrder(order) {
  try {
    await payments.charge(order.total, order.cardToken);
  } catch (e) {}
  order.status = "paid";
  return order;
}

function canDelete(user) {
  return !user.isAdmin;
}

function shippingCity(user) {
  return user.profile.address.city;
}

async function findOrders(db, status) {
  return db.query("SELECT * FROM orders WHERE status = '" + status + "'");
}

module.exports = { placeOrder, chargeOrder, canDelete, shippingCity, findOrders };
