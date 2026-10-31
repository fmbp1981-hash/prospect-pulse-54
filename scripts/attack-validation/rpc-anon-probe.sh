#!/usr/bin/env bash
# Probe de ataque (Task 5, Sprint 1): tenta chamar, com a chave ANON, as RPCs
# das funções SECURITY DEFINER dos grupos A (trigger), C (só servidor) e
# D (legado) via PostgREST: POST /rest/v1/rpc/<fn> com body {}.
#
# Saída: uma linha "<fn> <http_status>" por função. Nada mais é impresso
# (URL e chave nunca aparecem).
#
# Esperado ANTES da migration 20261030120000: status != 401/403 (alcançável).
# Esperado DEPOIS: 401 ou 403 (42501 permission denied) para as funções que o
# PostgREST consegue resolver com body {} (sem argumentos ou com todos os
# argumentos com default). Funções com argumento obrigatório respondem 404
# (PGRST202) antes e depois, porque o PostgREST não acha a sobrecarga sem
# argumentos; para elas a evidência é tests/db/function-privileges.sql.
#
# CUIDADO: ANTES da migration, uma função sem argumentos obrigatórios é
# EXECUTADA de verdade pelo anon (ex.: purge_expired_raw_payloads() apaga os
# payloads brutos expirados, que é o seu job normal). Para pular funções,
# passe a lista desejada como argumentos:
#   scripts/attack-validation/rpc-anon-probe.sh get_user_by_webhook_url purge_expired_raw_payloads
#
# Uso: rodar da raiz do repo (lê .env.local). Requer node >= 18 (fetch nativo).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="${repo_root}/.env.local"

if [[ ! -f "${env_file}" ]]; then
  echo "erro: ${env_file} não encontrado" >&2
  exit 1
fi

default_fns=(
  # Grupo A — só trigger
  set_organization_id_from_member
  set_user_id_on_insert
  set_tenant_and_origem_on_insert
  set_conversation_user_id
  handle_new_user_webhook
  leads_enqueue_trigger_function
  # Grupo C — só servidor
  find_lead_by_phone_digits
  get_user_by_evolution_instance
  match_document_chunks
  purge_expired_raw_payloads
  generate_user_webhook_url
  get_user_by_webhook_url
  claim_due_follow_ups
  # Grupo D — legado
  criar_lead_organico
  atualizar_lead_por_whatsapp
)

if [[ $# -gt 0 ]]; then
  fns=("$@")
else
  fns=("${default_fns[@]}")
fi

# O .env.local é lido dentro do node; os valores nunca passam pelo shell nem
# por argumentos de processo.
ENV_FILE="${env_file}" node -e '
const fs = require("fs");
const env = {};
for (const raw of fs.readFileSync(process.env.ENV_FILE, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
  let val = line.slice(eq + 1).trim();
  if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("\x27") && val.endsWith("\x27"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("erro: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente em .env.local");
  process.exit(1);
}
const base = url.replace(/\/+$/, "");
(async () => {
  for (const fn of process.argv.slice(1)) {
    let status;
    try {
      const res = await fetch(`${base}/rest/v1/rpc/${encodeURIComponent(fn)}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(15000),
      });
      status = String(res.status);
      await res.body?.cancel();
    } catch {
      status = "ERR";
    }
    console.log(`${fn} ${status}`);
  }
})();
' "${fns[@]}"
