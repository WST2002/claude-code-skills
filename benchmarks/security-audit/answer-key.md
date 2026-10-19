Real vulnerabilities (10):
1 SQLi users.js /search string concat (critical)
2 JWT decode without verify auth.js requireUser (critical, auth bypass)
3 Hardcoded JWT secret auth.js
4 IDOR orders.js GET /:id no ownership check
5 Mass assignment / SQL column injection users.js PUT /me (keys from body: role escalation + injection via keys)
6 Path traversal files.js download
7 Reflected XSS app.js /hello
8 CORS origin:true + credentials app.js
9 Logging all headers incl Authorization app.js
10 Vulnerable deps: lodash 4.17.15 (prototype pollution), jsonwebtoken 8.5.1 (CVE-2022-23529 etc), express 4.17.1 old
Also acceptable: users/:id exposes email of any user (IDOR-ish info disclosure), no rate limiting.
Decoys (must NOT be reported as vulns): parameterized queries (? placeholders), .env.example changeme, Math.random shuffle for banners.
