const FIX_LABELS = /^(bug|defect|regression|hotfix)$/i;
const FIX_WORDS = /\b(bug|error|errors|fail|fails|failing|broken|crash|crashes|crashing|exception|500|wrong|incorrect|ignores|ignored|instead of|does not|doesn't|cannot|can't|unable|regression)\b/i;
const MAX_SLUG = 40;

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
}

export function branchName({ id, title, labels = [] }, existing = []) {
  const isFix = labels.some((label) => FIX_LABELS.test(label)) || FIX_WORDS.test(title);
  const parts = [id && slugify(id), slugify(title)].filter(Boolean);
  const base = `${isFix ? "fix" : "feat"}/${parts.join("-")}`;
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
