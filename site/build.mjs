import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { CATEGORIES } from "./categories.mjs";
import { createZip } from "./zip.mjs";

export const SITE_URL = "https://wst2002.github.io/claude-code-skills";
const BASE_PATH = "/claude-code-skills";
const REPO = "WST2002/claude-code-skills";
const REPO_URL = `https://github.com/${REPO}`;
const AUTHOR = {
  name: "Wageesha Tripathi",
  linkedin: "https://www.linkedin.com/in/wst2002/",
  email: "tripathiwageesha2002@gmail.com",
  github: "https://github.com/WST2002",
};
const ACRONYMS = new Set(["api", "prd", "seo", "readme", "ci", "e2e", "pr", "qa", "db", "ui", "ux"]);
const SMALL_WORDS = new Set(["to", "of", "and", "for", "in", "on"]);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const displayName = (slug) =>
  slug
    .split("-")
    .map((w, i) => {
      if (ACRONYMS.has(w)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");

const stripTitle = (markdown) => markdown.replace(/^\s*# .*\r?\n/, "");

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => line.split(/:\s(.*)/s)).filter(([k, v]) => k && v).map(([k, v]) => [k.trim(), v.trim()]),
  );
  return { data, body: text.slice(match[0].length) };
}

const stripFooter = (markdown) => markdown.replace(/\n---\s*\n+Made by \*\*Wageesha Tripathi\*\*[\s\S]*$/, "\n");

function markdownFor(repoDir) {
  const marked = new Marked();
  marked.use({
    renderer: {
      link(href, title, text) {
        const isRelative = href && !/^(https?:|mailto:|#|\/)/.test(href);
        const target = isRelative ? `${REPO_URL}/blob/main/${repoDir}/${href}` : href;
        const external = /^https?:/.test(target) ? ' rel="noopener"' : "";
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}${external}>${text}</a>`;
      },
      image(href, title, text) {
        const isRelative = href && !/^(https?:|\/)/.test(href);
        const src = isRelative ? `${BASE_PATH}/${path.posix.join(repoDir, href)}` : href;
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${title ? ` title="${escapeHtml(title)}"` : ""}>`;
      },
    },
  });
  return (markdown) => marked.parse(markdown);
}

function readSkills() {
  return fs.readdirSync(path.join(root, "skills")).map((slug) => {
    const { data, body } = parseFrontmatter(fs.readFileSync(path.join(root, "skills", slug, "SKILL.md"), "utf8"));
    return { slug, name: displayName(slug), description: data.description ?? "", body: stripTitle(stripFooter(body)) };
  });
}

function readPlugins() {
  return fs.readdirSync(path.join(root, "plugins")).map((slug) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugins", slug, ".claude-plugin", "plugin.json"), "utf8"));
    const readme = fs.readFileSync(path.join(root, "plugins", slug, "README.md"), "utf8");
    return { slug, name: displayName(slug), description: manifest.description, body: stripTitle(stripFooter(readme)) };
  });
}

const metaDescription = (text) => {
  const clean = text.replace(/^Use when\s+/i, "Use it when ").replace(/\s+/g, " ").trim();
  return clean.length > 158 ? `${clean.slice(0, 155).replace(/\s+\S*$/, "")}…` : clean;
};

function layout({ title, description, canonical, body, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="author" content="${AUTHOR.name}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${BASE_PATH}/style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="top"><a class="brand" href="${BASE_PATH}/">Claude Code Skills</a><nav><a href="${BASE_PATH}/#skills">Skills</a><a href="${BASE_PATH}/#plugins">Plugins</a><a href="${REPO_URL}">GitHub ⭐</a></nav></header>
<main>${body}</main>
<footer class="foot">Made by <strong>${AUTHOR.name}</strong> · <a href="${AUTHOR.linkedin}">LinkedIn</a> · <a href="mailto:${AUTHOR.email}">Email</a> · <a href="${AUTHOR.github}">GitHub</a> · MIT License</footer>
</body>
</html>
`;
}

const authorLd = { "@type": "Person", name: AUTHOR.name, url: AUTHOR.github, sameAs: [AUTHOR.linkedin, AUTHOR.github] };

function itemPage(item, kind, related) {
  const canonical = `${SITE_URL}/${kind}s/${item.slug}/`;
  const label = kind === "skill" ? "Claude Code Skill" : "Claude Code Plugin";
  const install = kind === "skill"
    ? `<h3>Claude Code</h3>
<pre><code>npx skills add ${REPO} --skill ${item.slug}</code></pre>
<p class="muted">Or copy <a href="${REPO_URL}/tree/main/skills/${item.slug}"><code>skills/${item.slug}</code></a> into <code>~/.claude/skills/</code>.</p>
<h3>Claude app (no terminal)</h3>
<p><a class="button" href="${BASE_PATH}/downloads/${item.slug}.zip" download>Download ${escapeHtml(item.name)} (.zip)</a></p>
<ol class="muted"><li>In Claude, turn on <strong>Code execution</strong> (Settings → Capabilities).</li><li>Open <strong>Customize → Skills</strong>, click <strong>+</strong>, choose <strong>Upload a skill</strong> and pick the ZIP. Menu names can differ slightly between app versions.</li><li>Ask Claude for the task; it uses the skill when it fits.</li></ol>`
    : `<pre><code>claude plugin marketplace add ${REPO} &amp;&amp; claude plugin install ${item.slug}@claude-code-skills</code></pre>`;
  const relatedHtml = related.length
    ? `<section class="related"><h2>Related skills</h2><ul class="cards">${related.map(card).join("")}</ul></section>`
    : "";
  const body = `<article>
<p class="eyebrow">${label}</p>
<h1>${escapeHtml(item.name)}</h1>
<p class="lead">${escapeHtml(item.description)}</p>
<h2>Install</h2>
${install}
<div class="content">${markdownFor(`${kind}s/${item.slug}`)(item.body)}</div>
<p><a class="button" href="${REPO_URL}/tree/main/${kind}s/${item.slug}">View source on GitHub</a></p>
</article>
${relatedHtml}`;
  return layout({
    title: `${item.name} — ${label}`,
    description: metaDescription(item.description),
    canonical,
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: `${item.name} ${label}`,
      description: item.description,
      url: canonical,
      codeRepository: `${REPO_URL}/tree/main/${kind}s/${item.slug}`,
      programmingLanguage: kind === "skill" ? "Markdown" : "JavaScript",
      license: "https://opensource.org/licenses/MIT",
      author: authorLd,
    },
  });
}

const card = (item) =>
  `<li><a href="${BASE_PATH}/${item.kind}s/${item.slug}/"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(metaDescription(item.description))}</span></a></li>`;

function homePage(skills, plugins) {
  const bySlug = new Map(skills.map((s) => [s.slug, { ...s, kind: "skill" }]));
  const sections = CATEGORIES.map(
    (c) => `<section><h3>${escapeHtml(c.title)}</h3><ul class="cards">${c.skills.map((slug) => card(bySlug.get(slug))).join("")}</ul></section>`,
  ).join("");
  const body = `<section class="hero">
<h1>Claude Code Skills &amp; Plugins</h1>
<p class="lead">${skills.length} free, ready-to-use skills and ${plugins.length} plugins that make Claude Code and other AI coding agents faster, more reliable, and honest about their work: code review, security audit, Figma design compare, QA test cases, and one-command issue-to-PR.</p>
<pre><code>npx skills add ${REPO}</code></pre>
<p><a class="button" href="${REPO_URL}">Star on GitHub ⭐</a></p>
<p class="muted"><strong>Tested with answer keys:</strong> skills are benchmarked with and without the skill on sample projects with seeded bugs. <a href="${REPO_URL}/tree/main/benchmarks">See the benchmarks</a>.</p>
</section>
<h2 id="plugins">Plugins</h2>
<figure class="demo"><img src="${BASE_PATH}/media/proof-of-done-demo.gif" width="900" height="576" loading="lazy" alt="proof-of-done stops Claude Code from finishing without running the tests; the tests then find a bug it missed"><figcaption>proof-of-done in a real Claude Code session.</figcaption></figure>
<ul class="cards">${plugins.map((p) => card({ ...p, kind: "plugin" })).join("")}</ul>
<h2 id="skills">Skills</h2>
${sections}`;
  return layout({
    title: "Claude Code Skills & Plugins — free, open-source collection",
    description: `${skills.length} free Claude Code skills and ${plugins.length} plugins: code review, security audit, Figma design compare, QA test cases, Playwright tests, issue to PR and more. Install with one command.`,
    canonical: `${SITE_URL}/`,
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareSourceCode",
      name: "Claude Code Skills & Plugins",
      url: `${SITE_URL}/`,
      codeRepository: REPO_URL,
      license: "https://opensource.org/licenses/MIT",
      author: authorLd,
    },
  });
}

function sitemap(skills, plugins) {
  const urls = [`${SITE_URL}/`, ...plugins.map((p) => `${SITE_URL}/plugins/${p.slug}/`), ...skills.map((s) => `${SITE_URL}/skills/${s.slug}/`)];
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
}

// The Claude app expects a ZIP with the skill folder at its root.
function skillZip(slug) {
  const dir = path.join(root, "skills", slug);
  const files = fs.readdirSync(dir, { recursive: true }).filter((rel) => fs.statSync(path.join(dir, rel)).isFile()).sort();
  return createZip(files.map((rel) => ({ name: `${slug}/${rel.split(path.sep).join("/")}`, data: fs.readFileSync(path.join(dir, rel)) })));
}

function write(outDir, rel, content) {
  const file = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function buildSite(outDir) {
  const skills = readSkills();
  const plugins = readPlugins();
  const categoryOf = (slug) => CATEGORIES.find((c) => c.skills.includes(slug));
  for (const skill of skills) {
    const related = (categoryOf(skill.slug)?.skills ?? [])
      .filter((slug) => slug !== skill.slug)
      .map((slug) => ({ ...skills.find((s) => s.slug === slug), kind: "skill" }));
    write(outDir, `skills/${skill.slug}/index.html`, itemPage(skill, "skill", related));
    write(outDir, `downloads/${skill.slug}.zip`, skillZip(skill.slug));
    const examples = path.join(root, "skills", skill.slug, "examples");
    if (fs.existsSync(examples)) fs.cpSync(examples, path.join(outDir, "skills", skill.slug, "examples"), { recursive: true });
  }
  for (const plugin of plugins) write(outDir, `plugins/${plugin.slug}/index.html`, itemPage(plugin, "plugin", []));
  write(outDir, "index.html", homePage(skills, plugins));
  write(outDir, "sitemap.xml", sitemap(skills, plugins));
  write(outDir, "style.css", fs.readFileSync(path.join(root, "site", "style.css"), "utf8"));
  fs.cpSync(path.join(root, "media"), path.join(outDir, "media"), { recursive: true });
  write(outDir, ".nojekyll", "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(process.argv[2] ?? "_site");
  buildSite(outDir);
  console.log(`Site built in ${outDir}`);
}
