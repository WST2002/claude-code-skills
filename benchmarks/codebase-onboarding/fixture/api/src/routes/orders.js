const router = require("express").Router();
const service = require("../services/orderService");
router.post("/", async (req, res) => res.status(201).json(await service.create(req.body)));
module.exports = router;
