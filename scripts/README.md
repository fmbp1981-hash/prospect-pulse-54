# scripts/

Scripts operacionais para setup e manutenção do projeto.

## add-gh-secrets.mjs

Adiciona as variáveis de ambiente do Supabase como secrets no repositório GitHub, via GitHub REST API.

**Pré-requisitos:**
- `GITHUB_PAT` com escopo `repo` (ou `secrets` + `public_key`)
- Node.js 18+
- `npm install libsodium-wrappers` no diretório do projeto

**Uso:**
```bash
GITHUB_PAT=ghp_xxxx node scripts/add-gh-secrets.mjs
```

**O que faz:**
1. Busca as credenciais Supabase via Management API (PAT interno)
2. Criptografa cada secret com NaCl sealed box (obrigatório pela API do GitHub)
3. Cria/atualiza os secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

> Este arquivo está no `.gitignore` — contém lógica que referencia tokens. Não commitar.
