# Security audit checklist

Search patterns are starting points. Every hit must be verified (see SKILL.md, step 4).

| Class | What to look for | Search for |
|---|---|---|
| SQL / NoSQL injection | String-built queries with request data | `query(`, `execute(`, `raw(`, `` `SELECT ``, `" + `, `f"SELECT`, `$where`, `$regex` |
| Command injection | Shell calls with input | `exec(`, `execSync`, `spawn(.*shell`, `os.system`, `subprocess.*shell=True`, `Runtime.getRuntime().exec` |
| Path traversal | File paths built from input | `readFile(`, `sendFile(`, `open(`, `path.join(.*req`, `../` checks missing |
| XSS | Unescaped output | `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `\|safe`, `th:utext`, `res.send(` with input |
| Broken access control / IDOR | Record fetched by ID without owner check | `findById(req.params`, `get(id)` followed by no `userId`/`ownerId` comparison; admin routes without role check |
| Authentication | Weak token or session handling | `jwt.decode(` (no verify), `algorithms` missing, `none` alg, hardcoded JWT secret, long-lived tokens, password compare with `==` |
| Secrets | Credentials in code or logs | `api_key`, `secret`, `password =`, `AKIA`, `sk_live`, `BEGIN PRIVATE KEY`; `console.log(req.headers` |
| SSRF | Server fetches a user-supplied URL | `fetch(req.`, `axios.get(url`, `requests.get(url`, webhooks, image proxies |
| Insecure deserialization | Untrusted data into object loaders | `pickle.loads`, `yaml.load(` (not safe_load), `ObjectInputStream`, `unserialize(` |
| Open redirect | Redirect target from input | `redirect(req.query`, `res.redirect(`, `next=` params |
| CSRF | State-changing cookie-auth routes without token or SameSite | session cookies + POST forms, `csrf` absent |
| CORS | Reflected or wildcard origin with credentials | `Access-Control-Allow-Origin: *` + credentials, `origin: true`, echoing `req.headers.origin` |
| Cookies and headers | Missing protections | cookies without `HttpOnly`/`Secure`/`SameSite`; no CSP, HSTS |
| Crypto | Weak or misused primitives | `md5`, `sha1` for passwords, `Math.random()` for tokens, ECB mode, static IV |
| Mass assignment | Whole request body saved to model | `create(req.body)`, `update(req.body)`, `@ModelAttribute` on entities |
| Rate limiting | Login, OTP, password reset without limits | auth routes with no limiter middleware |
| Error handling | Stack traces or internals returned to clients | `res.send(err)`, `err.stack`, debug mode in production config |
| Dependencies | Known-vulnerable versions | `package-lock.json`, `requirements.txt`, `pom.xml`; run `npm audit`, `pip-audit`, `mvn dependency-check` if allowed |
| File upload | Type, size and storage location unchecked | `multer`, `upload`, saved under web root, no extension allowlist |

## Safe patterns (do not report)

- Parameterised queries (`?`, `$1`, `:name`, ORM query builders with bound values).
- Templating engines that escape by default (React JSX text, Jinja2 autoescape, Thymeleaf `th:text`).
- Secrets in `.env.example`, test fixtures, or clearly fake values.
- `Math.random()` used for UI, not security.
