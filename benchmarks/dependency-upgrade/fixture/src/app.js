const express = require("express");
const jwt = require("jsonwebtoken");
const uuid = require("uuid/v4");
const app = express();
app.get("/token", (req, res) => res.json({ token: jwt.sign({ id: uuid() }, process.env.SECRET) }));
app.get("/me", (req, res) => { try { res.json(jwt.verify(req.headers.authorization, process.env.SECRET)); } catch { res.status(401).end(); } });
app.get("/users/:id", (req, res) => res.redirect("back"));
module.exports = app;
