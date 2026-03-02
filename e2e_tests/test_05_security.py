#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 5 - Testes de Seguranca
LeadFinder Pro — prospect-pulse-54
Headers, CORS, XSS, info leak, autenticacao.
"""
import requests, json

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

print("\nFASE 5 - TESTES DE SEGURANCA")
print("=" * 60)

# ── 1. Headers de seguranca ───────────────────────────────────
print("\n[1] Headers de seguranca:")
r = requests.get(BASE_URL, timeout=TIMEOUT)
h = {k.lower(): v for k, v in r.headers.items()}

t("X-Content-Type-Options: nosniff",
  h.get("x-content-type-options", "") == "nosniff",
  f"Valor: {h.get('x-content-type-options','AUSENTE')}")

t("X-Frame-Options: DENY",
  "deny" in h.get("x-frame-options", "").lower(),
  f"Valor: {h.get('x-frame-options','AUSENTE')}")

t("Referrer-Policy presente",
  "referrer-policy" in h,
  "Header ausente")

t("Content-Security-Policy presente",
  "content-security-policy" in h,
  f"CSP ausente — adicionado no fix de seguranca")

t("Permissions-Policy presente",
  "permissions-policy" in h,
  "Header ausente")

# Strict-Transport-Security (HSTS) — pode nao existir em todos os contextos Vercel
hsts = h.get("strict-transport-security", "")
t("HSTS presente",
  bool(hsts),
  "HSTS ausente (Vercel pode nao setar dependendo do plano)")

# ── 2. CORS ────────────────────────────────────────────────────
print("\n[2] CORS:")
r_cors = requests.get(BASE_URL, headers={"Origin": "https://evil-site.com"}, timeout=TIMEOUT)
acao = r_cors.headers.get("Access-Control-Allow-Origin", "NAO_DEFINIDO")
t("CORS nao permite origens arbitrarias",
  acao != "*",
  f"CORS permite: {acao}")

# CORS nas rotas de API
r_api = requests.get(f"{BASE_URL}/api/agent/config",
                     headers={"Origin": "https://evil-site.com"},
                     timeout=TIMEOUT, allow_redirects=False)
acao_api = r_api.headers.get("Access-Control-Allow-Origin", "")
t("CORS API nao permite evil-site.com",
  "evil-site.com" not in acao_api,
  f"CORS API permite: {acao_api}")

# ── 3. Vazamento de informacoes em erros ──────────────────────
print("\n[3] Vazamento de info em erros:")
leak_indicators = [
    "traceback", "stack trace", "at /", "node_modules",
    "internal server", "sql", "database_url", ".env",
    "supabase_service_role", "next_", "connectionstring",
    "password", "secret"
]

# Endpoint com ID invalido
error_endpoints = [
    "/api/agent/config/nonexistent-id-99999",
    "/api/agent/rag?id=nonexistent-id-99999",
]
for ep in error_endpoints:
    try:
        r = requests.get(f"{BASE_URL}{ep}", timeout=TIMEOUT, allow_redirects=False)
        if r.status_code >= 400:
            body_lower = r.text.lower()
            leaked = [ind for ind in leak_indicators if ind in body_lower]
            t(f"Sem info leak em {ep}",
              len(leaked) == 0,
              f"Possiveis leaks: {leaked}")
        else:
            t(f"Sem info leak em {ep}", True)
    except Exception as e:
        t(f"Info leak {ep}", False, str(e))

# ── 4. XSS em query params ────────────────────────────────────
print("\n[4] XSS em query params:")
xss_payloads = [
    "<script>alert(1)</script>",
    '"><img src=x onerror=alert(1)>',
    "javascript:alert(1)",
]
for payload in xss_payloads:
    try:
        r = requests.get(f"{BASE_URL}/login",
                         params={"next": payload, "error": payload},
                         timeout=TIMEOUT)
        reflected = payload in r.text
        t(f"XSS nao refletido: {payload[:30]}",
          not reflected,
          f"Payload XSS refletido na resposta!")
    except Exception as e:
        t(f"XSS {payload[:30]}", False, str(e))

# ── 5. Webhook com Authorization header (nao deve bloquear) ───
print("\n[5] Webhook aceita requisicao sem Authorization (deve ser publico):")
try:
    r = requests.post(
        f"{BASE_URL}/api/webhooks/evolution",
        json={"event": "messages.upsert", "instance": "sec-test", "data": {}},
        timeout=TIMEOUT,
        allow_redirects=False
    )
    t("Webhook POST publico acessivel (sem auth necessaria)",
      r.status_code < 500,
      f"Status: {r.status_code}")
except Exception as e:
    t("Webhook POST publico", False, str(e))

# ── 6. Admin route com token invalido ────────────────────────
print("\n[6] Admin approve-user com token invalido:")
fake_jwt = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJGQUtFIn0.INVALIDO"
try:
    r = requests.post(
        f"{BASE_URL}/api/admin/approve-user",
        json={"userId": "some-user-id", "newRole": "admin"},
        headers={"Authorization": fake_jwt, "Content-Type": "application/json"},
        timeout=TIMEOUT,
        allow_redirects=False
    )
    t("approve-user com token invalido -> 403",
      r.status_code in [401, 403],
      f"Retornou {r.status_code} — poderia ter aprovado indevidamente")
except Exception as e:
    t("approve-user token invalido", False, str(e))

# ── 7. Webhook verify_token invalido -> 403 ────────────────────
print("\n[7] Webhook META verify_token invalido -> 403 (pos-fix):")
try:
    r = requests.get(
        f"{BASE_URL}/api/webhooks/evolution",
        params={"hub.mode": "subscribe", "hub.verify_token": "INVALIDO_TOKEN", "hub.challenge": "ch"},
        timeout=TIMEOUT,
        allow_redirects=False
    )
    t("Webhook verify_token invalido -> 403",
      r.status_code == 403,
      f"Retornou {r.status_code} — esperado 403")
except Exception as e:
    t("Webhook verify_token", False, str(e))

# ── 8. Prototype pollution ────────────────────────────────────
print("\n[8] Prototype pollution no webhook:")
try:
    r = requests.post(
        f"{BASE_URL}/api/webhooks/evolution",
        json={"__proto__": {"isAdmin": True}, "constructor": {"prototype": {"isAdmin": True}}},
        timeout=TIMEOUT,
        allow_redirects=False
    )
    t("Prototype pollution nao causa crash",
      r.status_code < 500,
      f"Status: {r.status_code}")
except Exception as e:
    t("Prototype pollution", False, str(e))

print(f"\nRESULTADO FASE 5: {results['passed']} passed, {results['failed']} failed")
for e in results["errors"]:
    print(f"  FALHA: {e['test']}: {e['detail']}")

with open("C:/Projects/prospect-pulse-54/e2e_tests/results_05.json", "w") as f:
    json.dump(results, f, ensure_ascii=False)
