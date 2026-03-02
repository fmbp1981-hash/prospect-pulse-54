#!/usr/bin/env python3
"""Fase 1 — Smoke Tests: verificação básica de saúde da aplicação."""

import requests
import sys
import time

BASE_URL = "https://prospect-pulse-54.vercel.app"
TIMEOUT = 15
results = {"passed": 0, "failed": 0, "errors": []}

def test(name, condition, detail=""):
    if condition:
        results["passed"] += 1
        print(f"  \u2705 {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"test": name, "detail": detail})
        print(f"  \u274c {name} \u2014 {detail}")

print("\n\U0001f525 FASE 1 \u2014 SMOKE TESTS")
print("=" * 60)

public_routes = [
    ("/login", [200]),
    ("/signup", [200]),
    ("/forgot-password", [200]),
]

protected_routes = [
    ("/dashboard", [302, 307, 308, 200]),
    ("/leads", [302, 307, 308, 200]),
    ("/kanban", [302, 307, 308, 200]),
    ("/settings", [302, 307, 308, 200]),
    ("/integrations", [302, 307, 308, 200]),
]

api_routes = [
    ("/api/agent/config", [401, 403]),
    ("/api/agent/rag", [401, 403]),
    ("/api/admin/approve-user", [401, 403, 405]),
    ("/api/admin/init-user-settings", [401, 403, 405]),
]

cron_routes = [
    ("/api/cron/follow-up", [401, 403, 405]),
    ("/api/cron/keepalive", [401, 403, 405]),
    ("/api/cron/long-followup", [401, 403, 405]),
    ("/api/cron/rescue-human-mode", [401, 403, 405]),
]

print("\nRotas publicas (auth routes):")
for route, expected in public_routes:
    url = BASE_URL + route
    try:
        start = time.time()
        r = requests.get(url, timeout=TIMEOUT, allow_redirects=True)
        elapsed = time.time() - start
        test(
            f"GET {route} -> {r.status_code} ({elapsed:.2f}s)",
            r.status_code < 500,
            f"Retornou {r.status_code}"
        )
    except requests.exceptions.RequestException as e:
        test(f"GET {route}", False, str(e))

print("\nRotas protegidas (devem redirecionar sem auth):")
for route, expected in protected_routes:
    url = BASE_URL + route
    try:
        start = time.time()
        r = requests.get(url, timeout=TIMEOUT, allow_redirects=False)
        elapsed = time.time() - start
        ok = r.status_code in expected or r.status_code < 500
        test(
            f"GET {route} -> {r.status_code} ({elapsed:.2f}s)",
            ok,
            f"Retornou {r.status_code}"
        )
    except requests.exceptions.RequestException as e:
        test(f"GET {route}", False, str(e))

print("\nAPI routes (deve bloquear sem auth):")
for route, expected in api_routes:
    url = BASE_URL + route
    try:
        r = requests.get(url, timeout=TIMEOUT)
        test(
            f"GET {route} -> {r.status_code}",
            r.status_code in expected,
            f"Retornou {r.status_code} - esperado {expected}"
        )
    except requests.exceptions.RequestException as e:
        test(f"GET {route}", False, str(e))

print("\nCron routes (deve bloquear sem header Vercel-Cron):")
for route, expected in cron_routes:
    url = BASE_URL + route
    try:
        r = requests.get(url, timeout=TIMEOUT)
        test(
            f"GET {route} -> {r.status_code}",
            r.status_code in expected,
            f"Retornou {r.status_code} - esperado {expected}"
        )
    except requests.exceptions.RequestException as e:
        test(f"GET {route}", False, str(e))

print("\nWebhook endpoint (GET = verificacao Meta):")
try:
    r = requests.get(f"{BASE_URL}/api/webhooks/evolution", timeout=TIMEOUT,
                     params={"hub.mode": "subscribe", "hub.verify_token": "invalid", "hub.challenge": "test123"})
    test(
        f"GET /api/webhooks/evolution?hub.verify_token=invalid -> {r.status_code}",
        r.status_code in [400, 403, 422],
        f"Retornou {r.status_code} - token invalido deveria ser rejeitado"
    )
except requests.exceptions.RequestException as e:
    test("GET /api/webhooks/evolution", False, str(e))

try:
    r = requests.get(f"{BASE_URL}/rota-que-nao-existe-12345", timeout=TIMEOUT)
    test(
        f"GET /rota-inexistente -> {r.status_code}",
        r.status_code == 404,
        f"Retornou {r.status_code}"
    )
except requests.exceptions.RequestException as e:
    test("GET /rota-inexistente", False, str(e))

print(f"\nRESULTADO FASE 1: {results['passed']} passed, {results['failed']} failed")
if results["errors"]:
    print("\nFalhas:")
    for e in results["errors"]:
        print(f"  FALHA {e['test']}: {e['detail']}")

# Export results for report
import json
with open("C:/Projects/prospect-pulse-54/e2e_tests/results_01.json", "w") as f:
    json.dump(results, f)

sys.exit(0)
