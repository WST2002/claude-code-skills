import express from "express";
import { requireUser } from "./auth.js";
import { notes } from "./store.js";
export const app = express();
app.use(express.json());
app.get("/notes", requireUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ data: notes.byOwner(req.user.id).slice(0, limit) });
});
app.post("/notes", requireUser, (req, res) => {
  if (!req.body.title?.trim()) return res.status(422).json({ errors: [{ field: "title", message: "required" }] });
  const note = notes.create({ ownerId: req.user.id, title: req.body.title });
  res.status(201).location(`/notes/${note.id}`).json(note);
});
app.get("/notes/:id", requireUser, (req, res) => {
  const note = notes.get(req.params.id);
  if (!note) return res.status(404).json({ error: "not found" });
  if (note.ownerId !== req.user.id) return res.status(404).json({ error: "not found" });
  res.json(note);
});
app.delete("/notes/:id", requireUser, (req, res) => {
  notes.remove(req.params.id, req.user.id);
  res.status(204).end();
});
