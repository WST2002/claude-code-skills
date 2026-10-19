const jwt = require("jsonwebtoken");

const JWT_SECRET = "sup3r-s3cret-key-2024";

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET);
}

function requireUser(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const payload = jwt.decode(token);
  if (!payload) return res.status(401).send("Unauthorized");
  req.user = payload;
  next();
}

module.exports = { sign, requireUser };
