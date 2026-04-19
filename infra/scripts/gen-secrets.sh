#!/usr/bin/env bash
# Generate AUTH_SECRET and SERVER_SECRET and patch .env

set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  echo "📋 Created $ENV_FILE from .env.example"
fi

AUTH_SECRET=$(openssl rand -base64 32)
SERVER_SECRET=$(openssl rand -base64 32 | head -c 32)

# Replace placeholders
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s|REPLACE_ME_run_gen_secrets_sh.*|${AUTH_SECRET}|1" "$ENV_FILE"
  sed -i '' "/SERVER_SECRET/s|REPLACE_ME_run_gen_secrets_sh.*|${SERVER_SECRET}|" "$ENV_FILE"
else
  sed -i "s|AUTH_SECRET=REPLACE_ME.*|AUTH_SECRET=${AUTH_SECRET}|" "$ENV_FILE"
  sed -i "s|SERVER_SECRET=REPLACE_ME.*|SERVER_SECRET=${SERVER_SECRET}|" "$ENV_FILE"
fi

echo "✅ Generated secrets in $ENV_FILE"
echo "   AUTH_SECRET  : ${AUTH_SECRET:0:8}…"
echo "   SERVER_SECRET: ${SERVER_SECRET:0:8}…"
echo ""
echo "⚠️  Never commit .env — it is in .gitignore"
