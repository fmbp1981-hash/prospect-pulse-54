# Segurança & DevSecOps — LeadFinder Pro

> Validar ANTES de cada PR/merge. Zero exceções.
> Gerado em: 2026-10-30
>
> **Hierarquia de segurança (decisão D8, 2026-09-16):** baseline, gate e LGPD têm autoridade
> própria no plugin DevSecOps — `devsecops:security-baseline`, `devsecops:security-gate` e
> `devsecops:lgpd-compliance`. Este arquivo cobre só regras de **implementação** IntelliX
> (middleware, Zod, headers, guardrails de LLM). Em caso de conflito de severidade, prazo ou
> controle, vale o DevSecOps.

## As 5 Regras de Ouro IntelliX (inegociáveis)

| # | Regra |
|---|-------|
| 1 | Se não há base legal LGPD documentada, o tratamento de dados não começa |
| 2 | Credencial no código é infração interna — zero tolerância |
| 3 | Dado de produção jamais entra em ambiente de desenvolvimento |
| 4 | Nenhum agente vai a produção sem validador de output implementado |
| 5 | Incidente: 2h interno · 24h cliente · prazo ANPD conforme norma vigente (Res. CD/ANPD nº 15/2024 na data do template — confirmar em `devsecops:lgpd-compliance`) |

---

## Defense in Depth — 4 Camadas Obrigatórias

```
1. Middleware Next.js     → bloqueia rotas sem sessão válida
2. Server Action / Route  → valida input com Zod (schema obrigatório)
3. Server Action / Route  → re-valida permissões consultando DB (não confiar no client)
4. Supabase RLS Policy    → última linha de defesa no banco de dados
```

> **Anti-pattern crítico:** `if (user.isAdmin)` no client é contornável com DevTools em 30 segundos.
> Role/permission check SEMPRE no server — nunca confiando em variável enviada pelo client.

---

## Pré-PR Checklist

### Segurança Base (100% dos PRs)
- [ ] Nenhuma API key em código client ou arquivo commitado
- [ ] Toda server action valida sessão no início (`await supabase.auth.getUser()`)
- [ ] RLS habilitado em toda tabela Supabase nova
- [ ] Rate limiting em endpoints públicos (Upstash ou in-memory)
- [ ] Inputs sanitizados com Zod antes de qualquer operação
- [ ] Erros não expõem stack trace ao client
- [ ] CORS configurado restritivamente (nunca `*`)
- [ ] Secrets apenas em variáveis server-side (nunca `NEXT_PUBLIC_` para dados sensíveis)
- [ ] Nenhuma lógica de role/permissão no client

### Segurança LLM (PRs com chamadas a LLMs)
- [ ] `prePromptFilter()` ativo — input sanitizado antes de enviar ao modelo
- [ ] `postOutputValidator()` ativo — output sanitizado antes de exibir
- [ ] `redactPII()` aplicado no input — CPF/email/telefone removidos antes do LLM
- [ ] Conta API comercial em uso (não ChatGPT Free/Plus nem Claude.ai Free/Pro)
- [ ] Rate limiting por usuário/tenant em chamadas LLM
- [ ] Limite de tokens por request definido (previne Denial of Wallet)

### LGPD (PRs com dados pessoais de pessoas físicas)
- [ ] Base legal documentada para os dados tratados neste PR
- [ ] Apenas dados mínimos necessários coletados (minimização — Art. 6, III)
- [ ] Fluxo de exclusão previsto para estes dados
- [ ] Decisões automatizadas por IA logadas com `automated: true` (Art. 20)

### CI/CD (por release)
- [ ] Gitleaks: zero secrets detectados
- [ ] Semgrep: zero vulnerabilidades CRITICAL/HIGH
- [ ] Trivy: zero CVEs CRITICAL em dependências
- [ ] `npm audit`: zero high/critical

---

## Artefatos de Código Canônicos

> Esta seção é a **fonte única de verdade** dos três artefatos de segurança usados em
> todo projeto IntelliX. Nenhuma outra skill ou template deve reimplementar o código
> completo abaixo — apenas referenciar este arquivo (`references/security.md` no projeto
> gerado). Copie o código destes blocos ao fazer scaffold, retrofit ou ao revisar
> chamadas LLM existentes.

### 1 — `src/lib/lgpd/pii-redactor.ts`

Redação de PII — executar ANTES de enviar qualquer dado ao LLM (LGPD Art. 46). Camada
obrigatória do pré-prompt filter (ver guardrails.ts abaixo).

```typescript
// src/lib/lgpd/pii-redactor.ts
const PII_PATTERNS = [
  { regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, token: '[CPF]' },
  { regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, token: '[EMAIL]' },
  { regex: /\b(\+55\s?)?(\(?\d{2}\)?\s?)?[\d\s\-]{8,}\b/g, token: '[TELEFONE]' },
  { regex: /\b\d{5}-?\d{3}\b/g, token: '[CEP]' },
]

export function redactPII(text: string): string {
  return PII_PATTERNS.reduce((acc, { regex, token }) => acc.replace(regex, token), text)
}

// Uso no pré-prompt filter:
// const safeInput = redactPII(userMessage)
// const response = await llm.complete({ prompt: safeInput })
```

### 2 — `src/lib/ai/guardrails.ts`

Pipeline obrigatório para toda chamada LLM em produção — Camadas 1 e 4 do modelo de
5 camadas (OWASP LLM Top 10 2025). Depende de `pii-redactor.ts` acima.

```typescript
// src/lib/ai/guardrails.ts — Pipeline obrigatório para todo LLM em produção
import { redactPII } from '@/lib/lgpd/pii-redactor' // obrigatório se dados de clientes

// Camada 1: Pré-prompt filter
export function prePromptFilter(userInput: string): { safe: boolean; sanitized: string } {
  const INJECTION_PATTERNS = [
    /ignore\s+(previous|all|above)\s+instructions/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /system\s*:\s*you/i,
    /\[INST\]|\[\/INST\]|<\|im_start\|>/i, // format injection
  ]

  const hasInjection = INJECTION_PATTERNS.some(p => p.test(userInput))
  if (hasInjection) return { safe: false, sanitized: '' }

  const sanitized = redactPII(userInput) // remove PII antes de enviar
  return { safe: true, sanitized }
}

// Camada 4: Pós-output validator (obrigatório)
export function postOutputValidator(output: string): { valid: boolean; sanitized: string } {
  // Detectar vazamento de system prompt
  const SYSTEM_LEAK_PATTERNS = [
    /you are (a|an) .+ assistant/i,
    /your instructions are/i,
    /system prompt/i,
  ]

  const hasLeak = SYSTEM_LEAK_PATTERNS.some(p => p.test(output))
  if (hasLeak) return { valid: false, sanitized: '[Resposta bloqueada por política de segurança]' }

  const sanitized = redactPII(output) // garantir que PII não vaze no output
  return { valid: true, sanitized }
}

// Uso em route handler ou server action:
// const pre = prePromptFilter(userMessage)
// if (!pre.safe) return { error: 'Input inválido' }
// const response = await llm.complete(pre.sanitized)
// const post = postOutputValidator(response)
// return post.sanitized
```

### 3 — `.github/workflows/security.yml`

Pipeline DevSecOps CI/CD — configurar uma vez por repositório, roda em todo PR.

```yaml
# .github/workflows/security.yml
name: DevSecOps Security Scan
on: [push, pull_request]

jobs:
  # Job 1: Detectar secrets commitados
  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }

  # Job 2: SAST — análise estática de código
  sast-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
        with:
          config: "p/typescript p/owasp-top-ten p/nextjs"

  # Job 3: SCA — dependências vulneráveis
  sca-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with:
          scan-type: "fs"
          format: "sarif"
          output: "trivy-results.sarif"
          severity: "CRITICAL,HIGH"
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: "trivy-results.sarif" }
```

**Regra de bloqueio:** PRs com vulnerabilidade CRITICAL não fazem merge.
HIGH exige dispensa documentada com justificativa no PR. Custo: zero — os três
scanners são open-source e gratuitos no GitHub Actions.

---

## Anti-patterns Críticos

```typescript
// ❌ NUNCA — validação de role no client
if (user.isAdmin) { /* hacker muda em 30s no DevTools */ }

// ✅ SEMPRE — buscar no banco no server action
const { data: profile } = await supabase
  .from('profiles').select('role').eq('id', user.id).single()
if (profile.role !== 'admin') return unauthorized()
```

```typescript
// ❌ NUNCA — service role key no client
const supabase = createClient(url, process.env.NEXT_PUBLIC_SERVICE_ROLE_KEY!)

// ✅ SEMPRE — service role apenas em server (sem NEXT_PUBLIC_)
const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

```typescript
// ❌ NUNCA — PII direto no LLM
const response = await llm.complete({ prompt: `Analise o CPF ${user.cpf}` })

// ✅ SEMPRE — redação antes do LLM
import { redactPII } from '@/lib/lgpd/pii-redactor'
const response = await llm.complete({ prompt: redactPII(`Analise o CPF ${user.cpf}`) })
// Envia ao LLM: "Analise o CPF [CPF]"
```
