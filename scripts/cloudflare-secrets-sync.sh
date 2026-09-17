#!/usr/bin/env bash
# Fase 3 do CLOUDFLARE_MIGRATION_PLAN.md — envia os secrets do projeto
# (lidos de .env / .env.local locais) para o Worker no Cloudflare via
# `wrangler secret put`. Nunca imprime os valores no terminal.
#
# Pré-requisito: `wrangler login` (ou CLOUDFLARE_API_TOKEN no ambiente).
#
# Uso:
#   ./scripts/cloudflare-secrets-sync.sh --dry-run   # só lista o que seria enviado
#   ./scripts/cloudflare-secrets-sync.sh              # envia de verdade (pede confirmação)

set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Ordem importa: .env primeiro (defaults do time), .env.local por cima
# (valores pessoais/locais têm prioridade), sem nunca ecoar os valores.
set -a
[[ -f .env ]] && source .env
[[ -f .env.local ]] && source .env.local
set +a

# Variáveis que são secret no Cloudflare (não aparecem no dashboard em texto claro).
SECRET_VARS=(
  SUPABASE_SERVICE_ROLE_KEY
  APIFY_API_KEY
  OPENAI_API_KEY
  FIRECRAWL_API_KEY
  RESEND_API_KEY
  EVOLUTION_API_KEY
  META_WA_TOKEN
  META_WA_VERIFY_TOKEN
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
  CRON_SECRET
)

# Variáveis públicas/config — não são secret, mas também não são pushadas
# automaticamente aqui: NEXT_PUBLIC_APP_URL depende do domínio da Fase 4
# (ainda não decidido) e as demais precisam de revisão manual em
# wrangler.jsonc -> "vars" antes do primeiro deploy.
CONFIG_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_APP_URL
  EVOLUTION_API_URL
  EVOLUTION_DEFAULT_INSTANCE
  EVOLUTION_INSTANCE_NAME
  META_WA_PHONE_NUMBER_ID
  META_WA_VERSION
  WHATSAPP_PROVIDER
  FROM_EMAIL
  XPAG_CONSULTANT_INSTANCE
  XPAG_CONSULTANT_WHATSAPP
)

echo "== Secrets (wrangler secret put) =="
missing=()
present=()
for name in "${SECRET_VARS[@]}"; do
  value="${!name:-}"
  if [[ -z "$value" ]]; then
    missing+=("$name")
    continue
  fi
  present+=("$name")
  if $DRY_RUN; then
    echo "  [dry-run] enviaria: $name"
  else
    echo "  enviando: $name"
    printf '%s' "$value" | npx wrangler secret put "$name" > /dev/null
  fi
done

echo
echo "== Config pública (revisar manualmente em wrangler.jsonc -> vars) =="
for name in "${CONFIG_VARS[@]}"; do
  value="${!name:-}"
  if [[ -n "$value" ]]; then
    echo "  $name está definida localmente — adicione ao wrangler.jsonc quando o domínio (Fase 4) estiver decidido."
  else
    echo "  $name não encontrada em .env/.env.local — confirme se é necessária."
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo
  echo "⚠️  Não encontradas em .env/.env.local (não enviadas): ${missing[*]}"
fi

if $DRY_RUN; then
  echo
  echo "Dry-run — nada foi enviado. Rode sem --dry-run para enviar de verdade."
fi
