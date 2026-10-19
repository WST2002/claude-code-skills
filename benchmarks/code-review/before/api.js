const { getTotal } = require("./cart");
module.exports = (req, res) => res.json({ total: getTotal(req.body.items) });
