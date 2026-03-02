#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fase 7 - Stress e Performance
LeadFinder Pro — prospect-pulse-54
Carga progressiva, tempos de resposta, limites de payload.
"""
import requests, json, time, statistics
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://prospect-pulse-54.vercel.app"
TIMEOUT = 30
results = {"passed": 0, "failed": 0, "errors": []}

def t(name, cond, detail=""):
    if cond:
        results["passed"] += 1
        print(f"  PASS: {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"test": name, "detail": detail})
        print(f"  FAIL: {name} -- {detail}")

def measure(url, n=5, method="GET", **kwargs):
    times, statuses = [], []
    for _ in range(n):
        s = time.time()
        try:
            r = requests.request(method, url, timeout=TIMEOUT, **kwargs)
            times.append(time.time() - s)
            statuses.append(r.status_code)
        except Exception:
            times.append(TIMEOUT)
            statuses.append(0)
    return {
        "mean": statistics.mean(times),
        "p95": sorted(times)[int(len(times)*0.95)] if len(times) > 1 else times[0],
        "max": max(times),
        "statuses": statuses,
    }

print("\nFASE 7 - STRESS E PERFORMANCE")
print("=" * 60)

# ── 1. Tempos de resposta rotas publicas ──────────────────────
print("\n[1] Tempos de resposta (rotas publicas, 5 amostras):")
routes_to_measure = [
    ("/login",           "GET", {}),
    ("/signup",          "GET", {}),
    ("/forgot-password", "GET", {}),
    ("/api/webhooks/evolution", "GET", {}),
]

MEAN_THRESHOLD = 5.0
P95_THRESHOLD  = 8.0

for path, method, kwargs in routes_to_measure:
    stats = measure(f"{BASE_URL}{path}", n=5, method=method, **kwargs)
    ok = stats["mean"] < MEAN_THRESHOLD and stats["p95"] < P95_THRESHOLD
    t(f"{method} {path} — media {stats['mean']:.2f}s p95 {stats['p95']:.2f}s",
      ok,
      f"Lento! media={stats['mean']:.2f}s p95={stats['p95']:.2f}s")

# ── 2. Stress progressivo ────────────────────────────────────
print("\n[2] Stress progressivo em /login:")
print(f"  {'N':<6} {'OK':<5} {'Err':<5} {'Media':<8} {'P95':<8} {'Status'}")
print(f"  {'-'*40}")

levels = [1, 5, 10, 25]
for n in levels:
    def req(_):
        s = time.time()
        try:
            r = requests.get(f"{BASE_URL}/login", timeout=TIMEOUT, allow_redirects=True)
            return {"s": r.status_code, "t": time.time()-s}
        except Exception:
            return {"s": 0, "t": TIMEOUT}

    with ThreadPoolExecutor(max_workers=n) as ex:
        res = list(ex.map(req, range(n)))

    errs  = sum(1 for r in res if r["s"] >= 500 or r["s"] == 0)
    times = [r["t"] for r in res]
    mean  = statistics.mean(times)
    p95   = sorted(times)[int(len(times)*0.95)] if len(times) > 1 else times[0]
    icon  = "OK" if errs == 0 else "WARN" if errs < n*0.1 else "FAIL"
    print(f"  {n:<6} {n-errs:<5} {errs:<5} {mean:<8.2f} {p95:<8.2f} {icon}")
    t(f"Stress {n}x em /login",
      errs < n*0.05,
      f"{errs}/{n} falharam")
    if errs > n * 0.2:
        print("  Sistema nao aguenta mais — parando stress test")
        break

# ── 3. Stress no webhook ──────────────────────────────────────
print("\n[3] Stress no webhook POST (10 simultaneos):")
wb_body = json.dumps({
    "event": "messages.upsert",
    "instance": "stress-test",
    "data": {
        "key": {"remoteJid": "5581988880000@s.whatsapp.net", "id": f"STRESS_001", "fromMe": False},
        "message": {"conversation": "stress test"},
        "messageType": "conversation",
        "pushName": "Stress"
    }
})

def send_wb(_):
    s = time.time()
    try:
        r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                          data=wb_body,
                          headers={"Content-Type": "application/json"},
                          timeout=TIMEOUT)
        return {"s": r.status_code, "t": time.time()-s}
    except Exception:
        return {"s": 0, "t": TIMEOUT}

with ThreadPoolExecutor(max_workers=10) as ex:
    wb_res = list(ex.map(send_wb, range(10)))

wb_errs  = sum(1 for r in wb_res if r["s"] >= 500 or r["s"] == 0)
wb_times = [r["t"] for r in wb_res]
wb_mean  = statistics.mean(wb_times)
print(f"  10 webhooks simultaneos: {10-wb_errs} OK, {wb_errs} erros, media {wb_mean:.2f}s")
t("Webhook aguentou 10 reqs simultaneas",
  wb_errs == 0,
  f"{wb_errs}/10 falharam")

# ── 4. Resposta do webhook < 500ms (fire-and-forget) ─────────
print("\n[4] Latencia webhook (deve retornar < 1s — fire-and-forget):")
LATENCY_THRESHOLD = 1.0
stats = measure(f"{BASE_URL}/api/webhooks/evolution", n=5, method="POST",
                data=wb_body, headers={"Content-Type": "application/json"},
                allow_redirects=False)
t(f"Webhook latencia media < {LATENCY_THRESHOLD}s (atual: {stats['mean']:.2f}s)",
  stats["mean"] < LATENCY_THRESHOLD,
  f"Lento! {stats['mean']:.2f}s — fire-and-forget deveria ser < 1s")

# ── 5. Payload crescente no webhook ─────────────────────────
print("\n[5] Payload crescente no webhook:")
sizes = [("1KB", 1024), ("10KB", 10240), ("100KB", 102400), ("500KB", 512000)]
for label, size in sizes:
    body = json.dumps({
        "event": "messages.upsert",
        "instance": "size-test",
        "data": {
            "key": {"remoteJid": "5581988880001@s.whatsapp.net", "id": f"SIZE_{label}", "fromMe": False},
            "message": {"conversation": "x" * size},
            "messageType": "conversation",
            "pushName": "SizeTest"
        }
    })
    try:
        r = requests.post(f"{BASE_URL}/api/webhooks/evolution",
                          data=body, headers={"Content-Type": "application/json"},
                          timeout=TIMEOUT)
        t(f"Webhook payload {label} nao crashou ({r.status_code})",
          r.status_code < 500,
          f"Server Error com payload {label}")
        if r.status_code == 413:
            print(f"  Limite de payload encontrado em {label}")
            break
    except Exception as e:
        t(f"Webhook payload {label}", False, str(e))

print(f"\nRESULTADO FASE 7: {results['passed']} passed, {results['failed']} failed")
for e in results["errors"]:
    print(f"  FALHA: {e['test']}: {e['detail']}")

with open("C:/Projects/prospect-pulse-54/e2e_tests/results_07.json", "w") as f:
    json.dump(results, f, ensure_ascii=False)
