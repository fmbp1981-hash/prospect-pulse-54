#!/usr/bin/env bash
# Envia os secrets do projeto (lidos de .env / .env.local locais) para o Worker
# no Cloudflare via `wrangler secret put`. Nunca imprime os valores no terminal:
# só nomes e "presente/ausente".
#
# Os arquivos .env NÃO são executados (`source`): o script lê só as chaves de
# que precisa, de forma literal (tudo depois do primeiro `=`, sem expandir
# variáveis nem comandos; aspas simples ou duplas em volta são removidas).
# .env.local tem prioridade sobre .env.
#
# Staging (`--env staging`) nunca recebe CRON_SECRET nem INTERNAL_QUEUE_SECRET:
# staging usa o banco de produção, então as rotas de cron e a rota interna da
# fila respondem 401 lá (e FOLLOW_UP_MODE=disabled no wrangler.jsonc).
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

# Lê o valor literal de KEY num arquivo .env, sem executar nada. Imprime o
# valor em stdout (só para captura em variável, nunca no terminal) e devolve 1
# se a chave não existir no arquivo. Aceita `KEY=valor` e `export KEY=valor`;
# remove \r, espaços nas pontas e aspas simples/duplas em volta.
read_env_value() {
  local key="$1" file="$2" line value found=1
  [[ -f "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*= ]]; then
      value="${line#*=}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ ${#value} -ge 2 ]]; then
        if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi
      found=0
    fi
  done < "$file"
  [[ $found -eq 0 ]] || return 1
  printf '%s' "$value"
}

# Valor de KEY: .env.local por cima de .env. Guarda em ENVVAL_<KEY> (bash 3.2:
# sem arrays associativos).
load_key() {
  local key="$1" value=""
  if value="$(read_env_value "$key" .env.local)"; then
    :
  elif value="$(read_env_value "$key" .env)"; then
    :
  else
    value=""
  fi
  printf -v "ENVVAL_${key}" '%s' "$value"
}

# Variáveis que são secret no Cloudflare (não aparecem no dashboard em texto claro).
SECRET_VARS=(
  SUPABASE_SERVICE_ROLE_KEY
  CRON_SECRET
  INTERNAL_QUEUE_SECRET
  CONNECTORS_MASTER_KEY_V1
  CONNECTORS_ACTIVE_KEY_VERSION
  UPSTASH_REDIS_REST_URL
  UPSTASH_REDIS_REST_TOKEN
)

# Nunca enviados para staging (staging usa o banco de produção).
PROD_ONLY_SECRET_VARS=(
  CRON_SECRET
  INTERNAL_QUEUE_SECRET
)

# Variáveis públicas/config: não são enviadas aqui. Ficam em wrangler.jsonc ->
# "vars" (runtime) e nas Build variables do Workers Builds (inlined no build).
# Só conferimos se estão definidas.
CONFIG_VARS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  NEXT_PUBLIC_APP_URL
)

is_prod_only() {
  local name="$1" p
  for p in "${PROD_ONLY_SECRET_VARS[@]}"; do
    [[ "$p" == "$name" ]] && return 0
  done
  return 1
}

TARGET_SECRET_VARS=()
for name in "${SECRET_VARS[@]}"; do
  if [[ -n "$TARGET_ENV" ]] && is_prod_only "$name"; then
    continue
  fi
  TARGET_SECRET_VARS+=("$name")
done

for name in "${TARGET_SECRET_VARS[@]}" "${CONFIG_VARS[@]}"; do
  load_key "$name"
done

WRANGLER_ENV_ARGS=()
if [[ -n "$TARGET_ENV" ]]; then
  WRANGLER_ENV_ARGS=(--env "$TARGET_ENV")
fi

echo "== Destino: ${TARGET_ENV:-produção} =="
echo
echo "== Secrets (wrangler secret put) =="
missing=()
for name in "${TARGET_SECRET_VARS[@]}"; do
  var="ENVVAL_${name}"
  if [[ -n "${!var:-}" ]]; then
    echo "  $name: presente"
  else
    echo "  $name: ausente"
    missing+=("$name")
  fi
done

if [[ -n "$TARGET_ENV" ]]; then
  echo
  echo "== Não enviados para ${TARGET_ENV} (só produção) =="
  for name in "${PROD_ONLY_SECRET_VARS[@]}"; do
    echo "  $name"
  done
fi

echo
echo "== Config pública (wrangler.jsonc -> vars e Build variables; nada é enviado) =="
for name in "${CONFIG_VARS[@]}"; do
  var="ENVVAL_${name}"
  if [[ -n "${!var:-}" ]]; then
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
for name in "${TARGET_SECRET_VARS[@]}"; do
  var="ENVVAL_${name}"
  echo "  enviando: $name"
  printf '%s' "${!var}" | npx wrangler secret put "$name" ${WRANGLER_ENV_ARGS[@]+"${WRANGLER_ENV_ARGS[@]}"} > /dev/null
done
echo
echo "Concluído."
