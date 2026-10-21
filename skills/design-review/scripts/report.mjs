#!/usr/bin/env node
// Turns review.json into one shareable HTML file: the screenshot with numbered pins, and the findings beside it.
//   node report.mjs review.json [review.html]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SEVERITIES = ["Blocker", "Major", "Minor", "Polish"];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function validate(review) {
  const errors = [];
  for (const field of ["title", "verdict", "image"]) if (typeof review[field] !== "string" || !review[field]) errors.push(`"${field}" is missing`);
  if (!Array.isArray(review.findings) || review.findings.length === 0) errors.push('"findings" needs at least one finding');
  (review.findings ?? []).forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!SEVERITIES.includes(f.severity)) errors.push(`${at}.severity must be one of ${SEVERITIES.join(", ")}`);
    for (const axis of ["x", "y"]) if (typeof f[axis] !== "number" || f[axis] < 0 || f[axis] > 100) errors.push(`${at}.${axis} must be a percentage from 0 to 100`);
    for (const field of ["where", "problem", "fix"]) if (!f[field]) errors.push(`${at}.${field} is missing`);
  });
  if (errors.length) throw new Error(`review.json is not valid: ${errors.join("; ")}`);
}

const list = (items) => (items?.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "");
const section = (title, items) => (items?.length ? `<section><h2>${title}</h2>${list(items)}</section>` : "");

export function renderReport(review, imageDataUri) {
  validate(review);
  const pins = review.findings
    .map((f, i) => `<a class="pin ${f.severity.toLowerCase()}" href="#f${i + 1}" style="left:${f.x}%;top:${f.y}%" aria-label="Finding ${i + 1}: ${escapeHtml(f.where)}">${i + 1}</a>`)
    .join("");
  const findings = review.findings
    .map(
      (f, i) => `<li id="f${i + 1}" class="finding">
<div class="head"><span class="num ${f.severity.toLowerCase()}">${i + 1}</span><span class="sev">${f.severity}</span><strong>${escapeHtml(f.where)}</strong></div>
<p><b>Problem:</b> ${escapeHtml(f.problem)}</p>
${f.why ? `<p><b>Why it matters:</b> ${escapeHtml(f.why)}</p>` : ""}
<p class="fix"><b>Fix:</b> ${escapeHtml(f.fix)}</p>
</li>`,
    )
    .join("");
  const counts = SEVERITIES.map((s) => [s, review.findings.filter((f) => f.severity === s).length]).filter(([, n]) => n);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design review: ${escapeHtml(review.title)}</title>
<style>
:root{--bg:#f6f6f8;--card:#fff;--text:#1d1d1f;--muted:#5f5f66;--line:#e3e3e8;--blocker:#c62828;--major:#e65100;--minor:#1565c0;--polish:#6a6a72;--fix:#e8f5e9}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--card:#1f1f23;--text:#f2f2f5;--muted:#a9a9b2;--line:#34343a;--fix:#1b2e1d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{padding:24px 16px 8px;max-width:1200px;margin:0 auto}h1{margin:0 0 6px;font-size:24px}
.verdict{margin:0;color:var(--muted)}.counts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 0;padding:0;list-style:none}
.counts li{padding:2px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line);font-size:13px}
main{display:flex;gap:24px;align-items:flex-start;max-width:1200px;margin:0 auto;padding:16px}main>div:last-child{flex:1 1 420px;min-width:0}
.shot{position:sticky;top:16px;flex:0 1 auto;min-width:0;max-width:60%}.frame{position:relative;display:inline-block;max-width:100%;vertical-align:top;border-radius:12px;overflow:hidden;border:1px solid var(--line)}
.frame img{display:block;max-width:100%;max-height:calc(100vh - 32px);width:auto;height:auto}
.pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;text-decoration:none;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.pin:hover,.pin:focus-visible,.pin.active{transform:translate(-50%,-50%) scale(1.25);outline:none}
.blocker{background:var(--blocker)}.major{background:var(--major)}.minor{background:var(--minor)}.polish{background:var(--polish)}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}h2{margin:0 0 8px;font-size:17px}
section ul,section ol{margin:0;padding-left:20px}.findings{list-style:none;padding:0;margin:0}
.finding{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px;scroll-margin-top:16px}
.finding:target,.finding.active{border-color:var(--text)}.finding p{margin:6px 0}
.head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.num{width:24px;height:24px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700}
.sev{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}.fix{background:var(--fix);border-radius:8px;padding:8px 10px}
footer{max-width:1200px;margin:0 auto;padding:8px 16px 32px;color:var(--muted);font-size:13px}
@media (max-width:760px){main{flex-direction:column}.shot{position:static;max-width:100%}.frame img{max-height:none}}
@media print{main{flex-direction:column}.shot{position:static;max-width:100%}.frame img{max-height:none}}
</style>
</head>
<body>
<header>
<h1>Design review: ${escapeHtml(review.title)}</h1>
<p class="verdict"><b>Verdict:</b> ${escapeHtml(review.verdict)}</p>
${review.goal ? `<p class="verdict"><b>Goal of this screen:</b> ${escapeHtml(review.goal)}</p>` : ""}
<ul class="counts">${counts.map(([s, n]) => `<li>${n} ${s}</li>`).join("")}</ul>
</header>
<main>
<div class="shot"><div class="frame"><img src="${imageDataUri}" alt="Screenshot of ${escapeHtml(review.title)} with numbered findings">${pins}</div></div>
<div>
${review.topFixes?.length ? `<section><h2>Fix these first</h2><ol>${review.topFixes.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol></section>` : ""}
<ol class="findings">${findings}</ol>
${section("Missing states", review.missingStates)}
${section("What works", review.works)}
</div>
</main>
<footer>Made with the design-review skill · github.com/WST2002/claude-code-skills</footer>
<script>
for (const pin of document.querySelectorAll(".pin")) {
  const item = document.querySelector(pin.getAttribute("href"));
  for (const el of [pin, item]) {
    el.addEventListener("mouseenter", () => { pin.classList.add("active"); item.classList.add("active"); });
    el.addEventListener("mouseleave", () => { pin.classList.remove("active"); item.classList.remove("active"); });
  }
}
</script>
</body>
</html>
`;
}

function main([input, output]) {
  if (!input) throw new Error("Usage: node report.mjs review.json [review.html]");
  const review = JSON.parse(fs.readFileSync(input, "utf8"));
  validate(review);
  const image = path.resolve(path.dirname(input), review.image);
  const mime = MIME[path.extname(image).toLowerCase()];
  if (!mime) throw new Error(`"${review.image}" is not a PNG, JPG or WebP image: export the screen as PNG`);
  const dataUri = `data:${mime};base64,${fs.readFileSync(image).toString("base64")}`;
  const out = output ?? input.replace(/\.json$/i, "") + ".html";
  fs.writeFileSync(out, renderReport(review, dataUri));
  return `Wrote ${out} (${review.findings.length} findings). Open it in a browser and share the file.`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
