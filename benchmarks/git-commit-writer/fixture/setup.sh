#!/usr/bin/env bash
# Recreates the git-commit-writer benchmark repo: Conventional Commits history + three unrelated staged changes.
set -e
mkdir -p commit-fixture && cd commit-fixture
git init -q -b main
git config user.name Fixture && git config user.email fixture@example.com
printf '{ "name": "shop", "dependencies": { "axios": "1.6.0" } }\n' > package.json
printf 'export function cartTotal(items) {\n  return items.reduce((s, i) => s + i.price, 0);\n}\n' > cart.js
printf '# Shop\n\nRun the the app with npm start.\n' > README.md
git add -A && git commit -qm "feat(cart): add cart total"
git commit -q --allow-empty -m "docs: add readme"
git commit -q --allow-empty -m "chore(deps): bump lodash"
printf 'export function cartTotal(items) {\n  return items.reduce((s, i) => s + i.price * i.quantity, 0);\n}\n' > cart.js
printf '{ "name": "shop", "dependencies": { "axios": "1.7.4" } }\n' > package.json
printf '# Shop\n\nRun the app with npm start.\n' > README.md
git add -A
echo "Ready: cd commit-fixture"
