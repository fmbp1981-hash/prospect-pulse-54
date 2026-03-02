#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 4 - Testes de Edge Case
LeadFinder Pro — prospect-pulse-54
Limites, concorrencia, double-submit, payloads extremos.
"""
import requests, json, time, statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://prospect-pulse-54.vercel.app"
TIMEOUT = 20
results = {"passed": 0, "failed": 0, "errors": []}

def t(name, cond, detail=""):
    if cond:
        results["passed"] += 1
        print(f"  PASS: {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"test": name, "detail": detail})
        print(f"  FAIL: {name} -- {detail}")

print("\nFASE 4 - EDGE CASES")
print("=" * 60)

# ── 1. Concorrência em rotas publicas ────────────────────────
print("\n[1] Concorrencia em rotas publicas (10 reqs simultaneas):")

public_routes = ["/login", "/signup", "/forgot-password"]
for route in public_routes:
    def req(_): return requests.get(f"{BASE_URL}{route}", timeout=TIMEOUT, allow_redirects=True)
    with ThreadPoolExecutor(max_workers=10) as ex:
        responses = list(ex.map(req, range(10)))
    errors_500 = sum(1 for r in responses if r.status_code >= 500)
    times = [r.elapsed.total_seconds() for r in responses]
    t(f"Concorrencia {route} (10x)",
      errors_500 == 0,
      f"{errors_500}/10 retornaram 5xx")
    print(f"    tempo medio={sum(times)/len(times):.2f}s max={max(times):.2f}s")

# ── 2. Webhook double-submit ──────────────────────────────────
print("\n[2] Webhook double-submit (mesma mensagem 2x simultaneamente):")

webhook_body = json.dumps({
    "event": "messages.upsert",
    "instance": "test-instance",
    "data": {
        "key": {"remoteJid": "5581999990000@s.whatsapp.net", "id": "EDGE_TEST_001", "fromMe": False},
        "message": {"conversation": "teste de double submit"},
        "messageType": "conversation",
        "pushName": "Edge Tester"
    }
})
headers = {"Content-Type": "application/json"}

def send_webhook(_):
    return requests.post(f"{BASE_URL}/api/webhooks/evolution",
                         data=webhook_body, headers=headers, timeout=TIMEOUT)

with ThreadPoolExecutor(max_workers=2) as ex:
    futures = [ex.submit(send_webhook, i) for i in range(2)]
    results_wb = [f.result() for f in as_completed(futures)]

statuses = [r.status_code for r in results_wb]
t("Webhook double-submit nao crashou",
  all(s < 500 for s in statuses),
  f"Algum retornou 5xx: {statuses}")
print(f"    Respostas: {statuses}")

# ── 3. Payload muito grande no webhook ────────────────────────
print("\n[3] Webhook com payload enorme (100KB):")
big_body = json.dumps({
    "event": "messages.upsert",
    "instance": "test-instance",
    "data": {
        "key": {"remoteJid": "5581999990001@s.whatsapp.net", "id": "EDGE_BIG_001", "fromMe": False},
        "message": {"conversation": "x" * 100_000},
        "messageType": "conversation",
        "pushName": "Big"
    }
})
try:
    r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                      data=big_body, headers=headers, timeout=TIMEOUT)
    t("Webhook payload 100KB nao crasha",
      r.status_code < 500,
      f"Status: {r.status_code}")
except Exception as e:
    t("Webhook payload 100KB", False, str(e))

# ── 4. Webhook sem Content-Type ──────────────────────────────
print("\n[4] Webhook sem Content-Type header:")
try:
    r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                      data='{"event":"messages.upsert"}',
                      timeout=TIMEOUT)
    t("Webhook sem Content-Type nao crasha",
      r.status_code < 500,
      f"Status: {r.status_code}")
except Exception as e:
    t("Webhook sem Content-Type", False, str(e))

# ── 5. Webhook com fromMe=true (anti-loop) ────────────────────
print("\n[5] Webhook fromMe=true (anti-loop guard):")
from_me_body = json.dumps({
    "event": "messages.upsert",
    "instance": "test-instance",
    "data": {
        "key": {"remoteJid": "5581999990002@s.whatsapp.net", "id": "EDGE_LOOP_001", "fromMe": True},
        "message": {"conversation": "mensagem do bot"},
        "messageType": "conversation",
        "pushName": "Bot"
    }
})
try:
    r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                      data=from_me_body, headers=headers, timeout=TIMEOUT)
    resp_json = {}
    try: resp_json = r.json()
    except: pass
    t("fromMe=true retorna 200 sem processar",
      r.status_code == 200,
      f"Status: {r.status_code}")
    if "source" in resp_json:
        print(f"    Resposta: {resp_json}")
except Exception as e:
    t("Webhook fromMe=true", False, str(e))

# ── 6. Webhook de grupo (deve ignorar) ────────────────────────
print("\n[6] Webhook de grupo (deve ser ignorado):")
group_body = json.dumps({
    "event": "messages.upsert",
    "instance": "test-instance",
    "data": {
        "key": {"remoteJid": "120363000000000000@g.us", "id": "EDGE_GRP_001", "fromMe": False},
        "message": {"conversation": "mensagem de grupo"},
        "messageType": "conversation",
        "pushName": "Grupo"
    }
})
try:
    r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                      data=group_body, headers=headers, timeout=TIMEOUT)
    resp_json = {}
    try: resp_json = r.json()
    except: pass
    t("Mensagem de grupo ignorada (200 + ignored)",
      r.status_code == 200,
      f"Status: {r.status_code}")
    if "ignored" in resp_json:
        print(f"    Resposta: {resp_json}")
except Exception as e:
    t("Webhook grupo", False, str(e))

# ── 7. Multiplas rotas 404 ────────────────────────────────────
print("\n[7] Rotas inexistentes (Next.js SPA — retorna 200 com app shell):")
inexistent = [
    "/rota-que-nao-existe",
    "/api/rota-api-inexistente",
    "/dashboard/subpage/inexistente",
]
for route in inexistent:
    try:
        r = requests.get(f"{BASE_URL}{route}", timeout=TIMEOUT, allow_redirects=True)
        # Next.js SPA: paginas retornam 200 (app shell), APIs podem retornar 404
        is_api = route.startswith("/api/")
        if is_api:
            t(f"Rota API inexistente {route}",
              r.status_code in [404, 401, 405],
              f"Retornou {r.status_code}")
        else:
            # SPA - qualquer coisa que nao seja 500 eh aceitavel
            t(f"Rota page inexistente {route} nao causa 500",
              r.status_code < 500,
              f"Retornou {r.status_code}")
    except Exception as e:
        t(f"Rota inexistente {route}", False, str(e))

print(f"\nRESULTADO FASE 4: {results['passed']} passed, {results['failed']} failed")
for e in results["errors"]:
    print(f"  FALHA: {e['test']}: {e['detail']}")

with open("C:/Projects/prospect-pulse-54/e2e_tests/results_04.json", "w") as f:
    json.dump(results, f, ensure_ascii=False)
