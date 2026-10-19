const router = require("express").Router();
const db = require("../db");
const { requireUser } = require("../auth");

function shuffleBanner(items) {
  return items.sort(() => Math.random() - 0.5);
}

router.get("/:id", requireUser, async (req, res) => {
  const [rows] = await db.query("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (!rows[0]) return res.status(404).send("Not found");
  res.json(rows[0]);
});

router.get("/", requireUser, async (req, res) => {
  const [rows] = await db.query("SELECT * FROM orders WHERE user_id = ?", [req.user.id]);
  res.json({ orders: rows, banners: shuffleBanner(["a", "b", "c"]) });
});

module.exports = router;
