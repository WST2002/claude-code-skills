const router = require("express").Router();
const db = require("../db");
const { requireUser } = require("../auth");

router.get("/search", async (req, res) => {
  const [rows] = await db.query("SELECT id, name FROM users WHERE name LIKE '%" + req.query.q + "%'");
  res.json(rows);
});

router.get("/:id", requireUser, async (req, res) => {
  const [rows] = await db.query("SELECT id, name, email FROM users WHERE id = ?", [req.params.id]);
  res.json(rows[0]);
});

router.put("/me", requireUser, async (req, res) => {
  const fields = Object.keys(req.body).map((k) => `${k} = ?`).join(", ");
  await db.query(`UPDATE users SET ${fields} WHERE id = ?`, [...Object.values(req.body), req.user.id]);
  res.json({ ok: true });
});

module.exports = router;
