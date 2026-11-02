#!/usr/bin/env bash
# Envia os secrets do projeto (lidos de .env / .env.local locais) para o Worker
# no Cloudflare via `wrangler secret put`. Nunca imprime os valores no terminal:
# só nomes e "presente/ausente".
#
# As credenciais de provedor (OpenAI, Resend, Firecrawl, Apify, Google Places,
# Evolution, Meta) NÃO são secrets do Worker: ficam cifradas no banco, em
# `platform_credentials` e `organization_connections`.
#
# Pré-requisito: `wrangler login` (ou CLOUDFLARE_API_TOKEN no ambiente).
#
# Uso:
#   ./scripts/cloudflare-secrets-sync.sh --dry-run               # só confere o que seria enviado
#   ./scripts/cloudflare-secrets-sync.sh                         # envia para produção
#   ./scripts/cloudflare-secrets-sync.sh --env staging           # envia para o Worker de staging
#   ./scripts/cloudflare-secrets-sync.sh --dry-run --env staging
#
# Variável ausente: o script lista as ausentes e termina com código 1 antes de
# enviar qualquer coisa.

set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=false
TARGET_ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --env)
      TARGET_ENV="${2:-}"
      if [[ -z "$TARGET_ENV" ]]; then
        echo "Erro: --env exige um valor (ex.: --env staging)." >&2
        exit 2
      fi
      shift 2
      ;;
    *)
      echo "Uso: $0 [--dry-run] [--env staging]" >&2
      exit 2
      ;;
  esac
done

# Ordem importa: .env primeiro (defaults do time), .env.local por cima
# (valores pessoais/locais têm prioridade), sem nunca ecoar os valores.
set -a
[[ -f .env ]] && source .env
[[ -f .env.local ]] && source .env.local
set +a

# Variáveis que são secret no Cloudflare (não aparecem no dashboard em texto claro).
SECRET_VARS=(
  SUPABASE_SERVICE_ROLE_KEY
  CRON_SECRET
  CONNECTORS_MASTER_KEY_V1
  CONNECTORS_ACTIVE_KEY_VERSION
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
)

# Variáveis públicas/config: não são enviadas aqui. Ficam em wrangler.jsonc ->
# "vars" (inlined no build pelo Next.js). Só conferimos se estão definidas.
CONFIG_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_APP_URL
)

WRANGLER_ENV_ARGS=()
if [[ -n "$TARGET_ENV" ]]; then
  WRANGLER_ENV_ARGS=(--env "$TARGET_ENV")
fi

echo "== Destino: ${TARGET_ENV:-produção} =="
echo
echo "== Secrets (wrangler secret put) =="
missing=()
for name in "${SECRET_VARS[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    echo "  $name: presente"
  else
    echo "  $name: ausente"
    missing+=("$name")
  fi
done

echo
echo "== Config pública (fica em wrangler.jsonc -> vars; nada é enviado) =="
for name in "${CONFIG_VARS[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    echo "  $name: presente"
  else
    echo "  $name: ausente"
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo
  echo "Erro: ausentes em .env/.env.local, nada foi enviado: ${missing[*]}" >&2
  exit 1
fi

if $DRY_RUN; then
  echo
  echo "Dry-run: nada foi enviado. Rode sem --dry-run para enviar de verdade."
  exit 0
fi

echo
echo "== Enviando =="
for name in "${SECRET_VARS[@]}"; do
  echo "  enviando: $name"
  printf '%s' "${!name}" | npx wrangler secret put "$name" ${WRANGLER_ENV_ARGS[@]+"${WRANGLER_ENV_ARGS[@]}"} > /dev/null
done
echo
echo "Concluído."
