#!/usr/bin/env bash
# P6: load CI secrets from Infisical (Universal Auth machine identity) into $GITHUB_ENV, masked.
# Usage: tools/infisical-gha-env.sh <secretPath> <INFISICAL_NAME>=<ENV_NAME> ...
set -euo pipefail
BASE=https://app.infisical.com; W=41982513-3430-4531-a227-9aa124fe024d; E=prod; P="$1"; shift
TOK=$(curl -fsS -X POST "$BASE/api/v1/auth/universal-auth/login" -H 'content-type: application/json' \
  -d "$(jq -n --arg i "$INFISICAL_CLIENT_ID" --arg s "$INFISICAL_CLIENT_SECRET" '{clientId:$i,clientSecret:$s}')" | jq -r .accessToken)
echo "::add-mask::$TOK"
for pair in "$@"; do
  src=${pair%%=*}; dst=${pair##*=}
  v=$(curl -fsS -H "authorization: Bearer $TOK" "$BASE/api/v3/secrets/raw/$src?workspaceId=$W&environment=$E&secretPath=$(jq -rn --arg p "$P" '$p|@uri')" | jq -r .secret.secretValue)
  [ -n "$v" ] && [ "$v" != null ] || { echo "::error::Infisical $P/$src missing"; exit 1; }
  echo "::add-mask::$v"; echo "$dst=$v" >> "$GITHUB_ENV"
done
