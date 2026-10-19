const router = require("express").Router();

router.get("/getUsers", async (req, res) => res.json(await db.users.findAll()));
router.post("/createOrder", async (req, res) => {
  if (!req.body.items) return res.status(200).json({ error: "items required" });
  const order = await db.orders.create(req.body);
  res.status(200).json(order);
});
router.get("/orders", async (req, res) => res.json(await db.orders.findAll()));
router.get("/deleteUser", async (req, res) => { await db.users.destroy(req.query.id); res.json({ ok: true }); });
router.get("/users/:id/orders", async (req, res) => res.json({ user_id: req.params.id, orderList: await db.orders.byUser(req.params.id) }));
router.post("/payments", async (req, res) => res.status(201).json(await payments.charge(req.body)));
router.patch("/users/:id", async (req, res) => res.json(await db.users.update(req.params.id, req.body)));
router.use((err, req, res, next) => res.status(500).json({ message: err.message, stack: err.stack }));

module.exports = router;
