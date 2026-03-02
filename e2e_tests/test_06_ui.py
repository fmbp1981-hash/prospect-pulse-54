import asyncio, json

async def run():
    from playwright.async_api import async_playwright

    BASE_URL = "https://prospect-pulse-54.vercel.app"
    r6 = {"passed": 0, "failed": 0, "errors": []}

    async def t6(name, cond, detail=""):
        if cond:
            r6["passed"] += 1
            print(f"  PASS: {name}")
        else:
            r6["failed"] += 1
            r6["errors"].append({"test": name, "detail": detail})
            print(f"  FAIL: {name} -- {detail}")

    print("FASE 6 - UI/UX")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        routes = ["/login", "/signup"]

        # Accessibility
        print("  Acessibilidade:")
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await ctx.new_page()

        for route in routes:
            await page.goto(f"{BASE_URL}{route}", wait_until="networkidle", timeout=20000)

            lang = await page.evaluate("() => { return document.documentElement.lang; }")
            await t6(f"{route} - lang attr presente", bool(lang), "Falta lang no html")

            imgs_no_alt = await page.evaluate(
                "() => { return Array.from(document.querySelectorAll('img')).filter(function(i){ return !i.alt && i.alt !== ''; }).length; }"
            )
            await t6(f"{route} - imgs com alt", imgs_no_alt == 0, f"{imgs_no_alt} imgs sem alt")

            btns_no_label = await page.evaluate(
                "() => { return Array.from(document.querySelectorAll('button')).filter(function(b){ var t=b.textContent ? b.textContent.trim() : ''; var a=b.getAttribute('aria-label'); var ti=b.getAttribute('title'); return !t && !a && !ti; }).length; }"
            )
            await t6(f"{route} - botoes acessiveis", btns_no_label == 0, f"{btns_no_label} botoes sem label")

            favicon = await page.evaluate(
                "() => { var l=document.querySelector('link[rel*=\"icon\"]'); return l ? l.href : null; }"
            )
            await t6(f"{route} - favicon configurado", bool(favicon), "Favicon ausente")

        # UX checks
        print("  UX - Placeholders e feedback:")
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=20000)

        email_ph = await page.evaluate("() => { var el=document.querySelector('input[type=\"email\"]'); return el ? el.placeholder : null; }")
        await t6("Login - email placeholder", bool(email_ph), "Email sem placeholder")

        pwd_ph = await page.evaluate("() => { var el=document.querySelector('input[type=\"password\"]'); return el ? el.placeholder : null; }")
        await t6("Login - password placeholder", bool(pwd_ph), "Password sem placeholder")

        # Title
        title = await page.title()
        await t6("Login - titulo da pagina", bool(title) and len(title) > 3, f"Titulo: {title!r}")

        # Submit empty form
        submit_btn = await page.query_selector('button[type="submit"]')
        if submit_btn:
            await submit_btn.click()
            await page.wait_for_timeout(2000)
            val_msg = await page.evaluate(
                "() => { return Array.from(document.querySelectorAll('input')).some(function(i){ return i.validationMessage || i.validity.valueMissing; }); }"
            )
            err_count = len(await page.query_selector_all('[class*="error"], [class*="alert"], [role="alert"], [class*="toast"]'))
            await t6("Login - feedback no submit vazio", val_msg or err_count > 0, "Nenhum feedback ao submeter vazio")

        await ctx.close()
        await browser.close()

    print(f"RESULTADO FASE 6: {r6['passed']} passed, {r6['failed']} failed")
    for e in r6["errors"]:
        print(f"  FALHA: {e['test']}: {e['detail']}")

    with open("C:/Projects/prospect-pulse-54/e2e_tests/results_06.json", "w") as f:
        json.dump(r6, f)

asyncio.run(run())
