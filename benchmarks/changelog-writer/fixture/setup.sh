#!/usr/bin/env bash
# Recreates the changelog-writer benchmark repo: tag v1.2.0 followed by user-facing, internal and breaking commits.
set -e
mkdir -p changelog-fixture && cd changelog-fixture
git init -q -b main
git config user.name Fixture && git config user.email fixture@example.com
c() { mkdir -p "$(dirname "$2")"; printf '%s\n' "$3" > "$2"; git add -A; git commit -q -m "$1"; }
c "feat: initial api" src/api.js v1
git tag v1.2.0
c "feat(export): export orders to CSV (#41)" src/export.js csv
c "fix(cart): keep coupon when quantity changes (#44)" src/cart.js fix
c "refactor: split order service into modules" src/orders.js split
c "ci: cache npm in workflow" .github/ci.yml ci
c "feat(api)!: paginate GET /orders (#47)

BREAKING CHANGE: GET /orders now returns { data, nextCursor } instead of an array." src/api.js v2
c "fix(deps): bump jsonwebtoken to 9.0.2 for CVE-2022-23529 (#48)" package.json "{}"
c "chore: wip" notes.txt wip
echo "Ready: cd changelog-fixture"
