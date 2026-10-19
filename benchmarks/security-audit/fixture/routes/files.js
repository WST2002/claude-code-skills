const router = require("express").Router();
const path = require("path");

const UPLOADS = path.join(__dirname, "..", "uploads");

router.get("/download", (req, res) => {
  res.sendFile(path.join(UPLOADS, req.query.name));
});

module.exports = router;
