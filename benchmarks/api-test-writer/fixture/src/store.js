const all = new Map();
let next = 1;
export const notes = {
  create(n) { const note = { id: String(next++), ...n }; all.set(note.id, note); return note; },
  get(id) { return all.get(id); },
  byOwner(ownerId) { return [...all.values()].filter((n) => n.ownerId === ownerId); },
  remove(id, ownerId) { const n = all.get(id); if (n && n.ownerId === ownerId) all.delete(id); },
};
