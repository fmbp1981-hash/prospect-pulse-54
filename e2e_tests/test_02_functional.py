#!/usr/bin/env python3
"""
Fase 2 — Testes Funcionais E2E com Playwright
LeadFinder Pro — prospect-pulse-54
Testa fluxos de autenticação, validação e comportamento do sistema sem credenciais válidas.
"""

import asyncio
import json
import requests
import time

BASE_URL = "https://prospect-pulse-54.vercel.app"
TIMEOUT = 20
results = {"passed": 0, "failed": 0, "errors": []}


def rtest(name, condition, detail=""):
    """Test helper para testes sem Playwright (requests)."""
    if condition:
        results["passed"] += 1
        print(f"  PASS: {name}")
    else:
        results["failed"] += 1
        results["errors"].append({"test": name, "detail": detail})
        print(f"  FAIL: {name} -- {detail}")


async def run():
    from playwright.async_api import async_playwright

    print("\nFASE 2 - TESTES FUNCIONAIS")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ─────────────────────────────────────────────────────────────
        # BLOCO 1 — Login: validação de formulário
        # ─────────────────────────────────────────────────────────────
        print("\n  [1/8] Login — submit vazio")
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)

        # Clica submit sem preencher nada
        submit = await page.query_selector('button[type="submit"]')
        if submit:
            await submit.click()
            await page.wait_for_timeout(2000)
            # Verifica se há mensagem de erro/validação
            error_visible = await page.evaluate("""
                () => {
                    var inputs = Array.from(document.querySelectorAll('input'));
                    var hasInvalid = inputs.some(i => !i.validity.valid);
                    var alerts = document.querySelectorAll('[role="alert"], [class*="error"], [class*="toast"]');
                    return hasInvalid || alerts.length > 0;
                }
            """)
            if condition := error_visible:
                results["passed"] += 1
                print(f"  PASS: Login submit vazio — validação exibida")
            else:
                results["failed"] += 1
                results["errors"].append({"test": "Login submit vazio", "detail": "Nenhuma validação visível"})
                print(f"  FAIL: Login submit vazio -- Nenhuma validação visível")
        else:
            results["failed"] += 1
            results["errors"].append({"test": "Login submit vazio", "detail": "Botão submit não encontrado"})
            print(f"  FAIL: Login submit vazio -- Botão submit não encontrado")

        # ─────────────────────────────────────────────────────────────
        # BLOCO 2 — Login com credenciais inválidas
        # ─────────────────────────────────────────────────────────────
        print("\n  [2/8] Login — credenciais inválidas")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        email_input = await page.query_selector('input[type="email"], input[name="email"]')
        pwd_input = await page.query_selector('input[type="password"], input[name="password"]')

        if email_input and pwd_input:
            await email_input.fill("usuario_invalido@teste123.com")
            await pwd_input.fill("SenhaErrada999!")
            submit = await page.query_selector('button[type="submit"]')
            if submit:
                await submit.click()
                # Aguarda resposta da API de auth
                await page.wait_for_timeout(4000)
                current_url = page.url
                # Deve permanecer em /login OU mostrar erro
                still_on_login = "/login" in current_url or "login" in current_url
                error_msg = await page.evaluate("""
                    () => {
                        var alerts = Array.from(document.querySelectorAll('[role="alert"], [class*="error"], [class*="toast"], [class*="Error"]'));
                        return alerts.some(a => a.textContent && a.textContent.trim().length > 0);
                    }
                """)
                if condition := (still_on_login or error_msg):
                    results["passed"] += 1
                    print(f"  PASS: Login credenciais inválidas — permaneceu em login ou exibiu erro")
                else:
                    results["failed"] += 1
                    results["errors"].append({"test": "Login credenciais inválidas", "detail": f"Redirecionou para {current_url}"})
                    print(f"  FAIL: Login credenciais inválidas -- Redirecionou para {current_url}")
        else:
            results["failed"] += 1
            results["errors"].append({"test": "Login credenciais inválidas", "detail": "Inputs de email/senha não encontrados"})
            print(f"  FAIL: Login credenciais inválidas -- Inputs não encontrados")

        await ctx.close()

        # ─────────────────────────────────────────────────────────────
        # BLOCO 3 — Signup: validação de campos
        # ─────────────────────────────────────────────────────────────
        print("\n  [3/8] Signup — email inválido")
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()
        await page.goto(f"{BASE_URL}/signup", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        email_input = await page.query_selector('input[type="email"], input[name="email"]')
        if email_input:
            await email_input.fill("email-invalido-sem-arroba")
            submit = await page.query_selector('button[type="submit"]')
            if submit:
                await submit.click()
                await page.wait_for_timeout(2000)
                still_on_signup = "/signup" in page.url
                has_validation = await page.evaluate("""
                    () => {
                        var inputs = Array.from(document.querySelectorAll('input[type="email"]'));
                        return inputs.some(i => !i.validity.valid);
                    }
                """)
                if condition := (still_on_signup and has_validation):
                    results["passed"] += 1
                    print(f"  PASS: Signup email inválido — bloqueado com validação")
                else:
                    results["failed"] += 1
                    results["errors"].append({"test": "Signup email inválido", "detail": f"URL: {page.url}, validação: {has_validation}"})
                    print(f"  FAIL: Signup email inválido -- URL: {page.url}")

        # ─────────────────────────────────────────────────────────────
        # BLOCO 4 — Signup: senha fraca/vazia
        # ─────────────────────────────────────────────────────────────
        print("\n  [4/8] Signup — submit vazio")
        await page.goto(f"{BASE_URL}/signup", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)
        submit = await page.query_selector('button[type="submit"]')
        if submit:
            await submit.click()
            await page.wait_for_timeout(2000)
            still_on_signup = "/signup" in page.url
            has_any_feedback = await page.evaluate("""
                () => {
                    var inputs = Array.from(document.querySelectorAll('input'));
                    var hasInvalid = inputs.some(i => i.required && !i.validity.valid);
                    var alerts = document.querySelectorAll('[role="alert"], [class*="error"], [class*="toast"]');
                    return hasInvalid || alerts.length > 0;
                }
            """)
            if condition := (still_on_signup or has_any_feedback):
                results["passed"] += 1
                print(f"  PASS: Signup submit vazio — validação correta")
            else:
                results["failed"] += 1
                results["errors"].append({"test": "Signup submit vazio", "detail": "Formulário submetido sem validação"})
                print(f"  FAIL: Signup submit vazio -- Sem feedback")

        await ctx.close()

        # ─────────────────────────────────────────────────────────────
        # BLOCO 5 — Redirecionamento de rotas protegidas → /login
        # ─────────────────────────────────────────────────────────────
        print("\n  [5/8] Redirecionamento rotas protegidas -> /login")
        protected = ["/dashboard", "/leads", "/kanban", "/settings", "/integrations"]
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()

        for route in protected:
            await page.goto(f"{BASE_URL}{route}", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1000)
            final_url = page.url
            # Deve estar em /login ou /signup após redirect
            redirected_to_auth = "login" in final_url or "signup" in final_url
            if condition := redirected_to_auth:
                results["passed"] += 1
                print(f"  PASS: {route} → redireciona para {final_url}")
            else:
                results["failed"] += 1
                results["errors"].append({"test": f"Redirect {route}", "detail": f"Não redirecionou para login — URL final: {final_url}"})
                print(f"  FAIL: {route} -- URL final: {final_url}")

        await ctx.close()

        # ─────────────────────────────────────────────────────────────
        # BLOCO 6 — Página /forgot-password funcional
        # ─────────────────────────────────────────────────────────────
        print("\n  [6/8] Forgot-password — comportamento")
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()
        await page.goto(f"{BASE_URL}/forgot-password", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # Verificar que tem input de email
        has_email_input = bool(await page.query_selector('input[type="email"], input[name="email"]'))
        if condition := has_email_input:
            results["passed"] += 1
            print(f"  PASS: Forgot-password — input de email presente")
        else:
            results["failed"] += 1
            results["errors"].append({"test": "Forgot-password input", "detail": "Input de email não encontrado"})
            print(f"  FAIL: Forgot-password -- Input de email não encontrado")

        # Tentar enviar com email inválido
        email_input = await page.query_selector('input[type="email"], input[name="email"]')
        if email_input:
            await email_input.fill("emailinvalido")
            submit = await page.query_selector('button[type="submit"]')
            if submit:
                await submit.click()
                await page.wait_for_timeout(2000)
                still_on_fp = "forgot" in page.url
                has_validation = await page.evaluate("""
                    () => Array.from(document.querySelectorAll('input[type="email"]'))
                        .some(i => !i.validity.valid)
                """)
                if condition := (still_on_fp or has_validation):
                    results["passed"] += 1
                    print(f"  PASS: Forgot-password email inválido — validado")
                else:
                    results["failed"] += 1
                    results["errors"].append({"test": "Forgot-password email inválido", "detail": f"URL: {page.url}"})
                    print(f"  FAIL: Forgot-password email inválido -- sem validação")

        await ctx.close()
        await browser.close()

    # ─────────────────────────────────────────────────────────────
    # BLOCO 7 — API com Bearer token inválido (via requests)
    # ─────────────────────────────────────────────────────────────
    print("\n  [7/8] API com Bearer token inválido")
    api_endpoints = [
        "/api/agent/config",
        "/api/agent/rag",
    ]
    fake_token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkZha2VUb2tlbiIsImlhdCI6MTUxNjIzOTAyMn0.FAKE_SIGNATURE"
    for ep in api_endpoints:
        try:
            r = requests.get(
                f"{BASE_URL}{ep}",
                headers={"Authorization": fake_token},
                timeout=TIMEOUT
            )
            # Com token inválido deve retornar 401/403, não 200 com dados
            if condition := r.status_code in [401, 403]:
                results["passed"] += 1
                print(f"  PASS: {ep} com token inválido → {r.status_code}")
            else:
                results["failed"] += 1
                results["errors"].append({"test": f"API auth {ep}", "detail": f"Retornou {r.status_code} com token inválido"})
                print(f"  FAIL: {ep} com token inválido -- Retornou {r.status_code}")
        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"test": f"API auth {ep}", "detail": str(e)})
            print(f"  FAIL: {ep} -- {e}")

    # ─────────────────────────────────────────────────────────────
    # BLOCO 8 — Consistência de UI entre login e signup
    # ─────────────────────────────────────────────────────────────
    print("\n  [8/8] Links de navegação entre login ↔ signup")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()

        # Login deve ter link para signup
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
        # Aguarda hydration React completar antes de avaliar os links
        try:
            await page.wait_for_selector("a[href]", timeout=8000)
        except Exception:
            pass
        has_signup_link = await page.evaluate("""
            () => {
                var links = Array.from(document.querySelectorAll('a[href]'));
                return links.some(a => a.href && (a.href.includes('/signup') || a.href.includes('cadastr') || a.textContent.toLowerCase().includes('criar')));
            }
        """)
        if condition := has_signup_link:
            results["passed"] += 1
            print(f"  PASS: Login — tem link para signup")
        else:
            results["failed"] += 1
            results["errors"].append({"test": "Login link para signup", "detail": "Link para /signup não encontrado na página de login"})
            print(f"  FAIL: Login -- sem link para signup")

        # Signup deve ter link para login
        await page.goto(f"{BASE_URL}/signup", wait_until="networkidle", timeout=30000)
        try:
            await page.wait_for_selector("a[href]", timeout=8000)
        except Exception:
            pass
        has_login_link = await page.evaluate("""
            () => {
                var links = Array.from(document.querySelectorAll('a[href]'));
                return links.some(a => a.href && (a.href.includes('/login') || a.textContent.toLowerCase().includes('entrar') || a.textContent.toLowerCase().includes('login')));
            }
        """)
        if condition := has_login_link:
            results["passed"] += 1
            print(f"  PASS: Signup — tem link para login")
        else:
            results["failed"] += 1
            results["errors"].append({"test": "Signup link para login", "detail": "Link para /login não encontrado na página de signup"})
            print(f"  FAIL: Signup -- sem link para login")

        await ctx.close()
        await browser.close()

    # ─────────────────────────────────────────────────────────────
    # Resultado final
    # ─────────────────────────────────────────────────────────────
    print(f"\nRESULTADO FASE 2: {results['passed']} passed, {results['failed']} failed")
    if results["errors"]:
        print("\nFalhas:")
        for e in results["errors"]:
            print(f"  FALHA {e['test']}: {e['detail']}")

    with open("C:/Projects/prospect-pulse-54/e2e_tests/results_02.json", "w") as f:
        json.dump(results, f, ensure_ascii=False)

    print(f"\nResultados salvos em e2e_tests/results_02.json")


asyncio.run(run())
