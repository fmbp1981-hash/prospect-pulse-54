#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 3 - Testes Negativos
LeadFinder Pro — prospect-pulse-54
Inputs invalidos, payloads maliciosos, metodos nao permitidos.
"""
import requests, json, sys
BASE_URL = "https://prospect-pulse-54.vercel.app"
TIMEOUT = 15
results = {"passed": 0, "failed": 0, "errors": []}

def t(name, cond, detail=""):
    if cond:
        results["passed"] += 1
        print(f"  PASS: {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"test": name, "detail": detail})
        print(f"  FAIL: {name} -- {detail}")

print("\nFASE 3 - TESTES NEGATIVOS")
print("=" * 60)

# ── 1. Metodos HTTP nao permitidos ─────────────────────────────
print("\n[1] Metodos HTTP invalidos:")

method_tests = [
    # (endpoint, metodo_invalido, expected_codes)
    ("/api/webhooks/evolution", "PUT",    [405, 401, 403]),
    ("/api/webhooks/evolution", "DELETE", [405, 401, 403]),
    ("/api/agent/config",       "PATCH",  [405, 401, 403]),
    ("/api/cron/follow-up",     "POST",   [405, 401, 403]),
    ("/api/cron/long-followup", "POST",   [405, 401, 403]),
    ("/api/cron/keepalive",     "POST",   [405, 401, 403]),
]

for path, method, expected in method_tests:
    try:
        r = requests.request(method, f"{BASE_URL}{path}", timeout=TIMEOUT,
                             json={"test": "data"}, allow_redirects=False)
        t(f"{method} {path}", r.status_code in expected,
          f"Retornou {r.status_code}, esperado {expected}")
    except Exception as e:
        t(f"{method} {path}", False, str(e))

# ── 2. Payloads maliciosos em endpoints POST ──────────────────
print("\n[2] Payloads maliciosos (POST /api/admin/init-user-settings):")

malicious_payloads = [
    {"userId": ""},
    {"userId": None},
    {"userId": "<script>alert(1)</script>"},
    {"userId": "'; DROP TABLE users; --"},
    {"userId": "a" * 5000},
    {"userId": {"$gt": ""}},
    {},
    {"notUserId": "test"},
]

for payload in malicious_payloads:
    try:
        r = requests.post(f"{BASE_URL}/api/admin/init-user-settings",
                          json=payload, timeout=TIMEOUT, allow_redirects=False)
        t(f"init-user-settings payload {str(payload)[:40]}",
          r.status_code != 500,
          f"Server Error 500 com payload: {str(payload)[:60]}")
    except Exception as e:
        t(f"init-user-settings payload", False, str(e))

# ── 3. Webhook com payloads invalidos ────────────────────────
print("\n[3] Webhook POST com payloads invalidos:")

webhook_payloads = [
    "not json at all",
    "",
    "null",
    '{"event": "messages.upsert", "data": null}',
    '{"event": "messages.upsert", "data": {}}',
    '{"event": "messages.upsert", "instance": "", "data": {"key": {}, "message": {}}}',
]

for raw_payload in webhook_payloads:
    try:
        r = requests.post(
            f"{BASE_URL}/api/webhooks/evolution",
            data=raw_payload,
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT,
            allow_redirects=False
        )
        t(f"webhook payload '{raw_payload[:35]}'",
          r.status_code < 500,
          f"Server crash: {r.status_code}")
    except Exception as e:
        t(f"webhook payload", False, str(e))

# ── 4. Cron sem CRON_SECRET — deve bloquear ──────────────────
print("\n[4] Cron sem Authorization (deve ser 401 apos deploy):")

cron_routes = [
    "/api/cron/follow-up",
    "/api/cron/long-followup",
    "/api/cron/keepalive",
    "/api/cron/rescue-human-mode",
]
for route in cron_routes:
    try:
        r = requests.get(f"{BASE_URL}{route}", timeout=TIMEOUT, allow_redirects=False)
        t(f"Cron sem auth {route}",
          r.status_code in [401, 403],
          f"Retornou {r.status_code} — deveria bloquear")
    except Exception as e:
        t(f"Cron sem auth {route}", False, str(e))

print("\n[5] Cron com token errado (deve ser 401):")
for route in cron_routes:
    try:
        r = requests.get(f"{BASE_URL}{route}",
                         headers={"Authorization": "Bearer token_errado_12345"},
                         timeout=TIMEOUT, allow_redirects=False)
        t(f"Cron token errado {route}",
          r.status_code in [401, 403],
          f"Retornou {r.status_code}")
    except Exception as e:
        t(f"Cron token errado {route}", False, str(e))

# ── 5. Webhook GET com verify_token invalido ─────────────────
print("\n[6] Webhook GET verify_token invalido (deve ser 403):")
try:
    r = requests.get(
        f"{BASE_URL}/api/webhooks/evolution",
        params={"hub.mode": "subscribe", "hub.verify_token": "TOKEN_INVALIDO_XYZ", "hub.challenge": "ch123"},
        timeout=TIMEOUT,
        allow_redirects=False
    )
    t("webhook verify_token invalido -> 403",
      r.status_code == 403,
      f"Retornou {r.status_code} — esperado 403")
except Exception as e:
    t("webhook verify_token invalido", False, str(e))

# ── 6. API routes sem auth devem retornar 401 JSON ───────────
print("\n[7] API routes sem auth devem retornar 401 JSON (nao redirect):")
api_routes = [
    "/api/agent/config",
    "/api/agent/rag",
]
for route in api_routes:
    try:
        r = requests.get(f"{BASE_URL}{route}", timeout=TIMEOUT, allow_redirects=False)
        is_json_resp = "json" in r.headers.get("content-type", "")
        t(f"{route} sem auth -> 401 JSON",
          r.status_code == 401 and is_json_resp,
          f"Status={r.status_code}, json={is_json_resp}")
    except Exception as e:
        t(f"{route} sem auth", False, str(e))

print(f"\nRESULTADO FASE 3: {results['passed']} passed, {results['failed']} failed")
for e in results["errors"]:
    print(f"  FALHA: {e['test']}: {e['detail']}")

with open("C:/Projects/prospect-pulse-54/e2e_tests/results_03.json", "w") as f:
    json.dump(results, f, ensure_ascii=False)
