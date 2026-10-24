#!/usr/bin/env bash
# Automated gate: verify a deployed youareinthegame site. Usage: scripts/verify-site.sh <https://host>
set -euo pipefail
U="${1%/}"; ok=0
for i in $(seq 1 12); do curl -fsS "$U/" -o /tmp/idx.html && grep -q 'id="mainCreature"' /tmp/idx.html && ok=1 && break; sleep 10; done
[ "$ok" = 1 ] || { echo "::error::$U/ not serving the site"; exit 1; }
for f in content/characters-registry.json content/vignettes-registry.json content/global-effects-registry.json content/session-policy.json; do
  curl -fsS "$U/$f" | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))' || { echo "::error::$f bad"; exit 1; }
done
# Every .js and .png in the build must be served as itself (Pages returns index.html for missing paths).
(cd dist && find . -type f \( -name '*.js' -o -name '*.png' -o -name '*.css' \) | sed 's#^\./##') | while IFS= read -r p; do
  enc=$(node -e 'console.log(encodeURI(process.argv[1]))' "$p")
  ct=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$U/$enc")
  case "$ct" in 200\ text/html*|[!2]*) echo "::error::$p → $ct"; exit 1;; esac
done
curl -fsS "$U/api/session-assignment" | node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!d.ok||!d.assignment?.characterId||!d.assignment?.vignetteId) process.exit(1); console.log("session", JSON.stringify(d.assignment))'
node tests/click-test.mjs "$U"
echo "verify ok $U"
