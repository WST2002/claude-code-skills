const db = require("../db");
exports.create = async (input) => db.query("INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING *", [input.userId, input.total]).then((r) => r.rows[0]);
