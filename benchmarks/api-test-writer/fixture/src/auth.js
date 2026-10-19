export function requireUser(req, res, next) {
  const id = req.headers["x-user-id"];
  if (!id) return res.status(401).json({ error: "unauthenticated" });
  req.user = { id };
  next();
}
