# LeadFinder Pro — Architecture Reference

> Regras de arquitetura específicas deste projeto. Em conflito com MASTER-ARCHITECTURE.md, este arquivo perde.

## Stack
- **Framework:** Next.js 15 App Router
- **Language:** TypeScript (strict: false — migration pendente para strict: true)
- **Database:** Supabase PostgreSQL 17.6 (projeto: kzvnwqlcrtxwagxkghxq, sa-east-1)
- **Auth:** Supabase Auth + JWT
- **Styling:** Tailwind CSS + Shadcn/UI
- **AI:** OpenAI GPT-4.1 (via AIAgentService com circuit breaker)
- **WhatsApp:** Evolution API (provider abstrato — suporta Meta Cloud API também)

## Princípios Locais

1. **Multi-tenancy por user_id** — toda tabela tem `user_id` com RLS ativo
2. **Thin Client** — nenhuma chave de API no frontend, toda lógica de negócio em API routes
3. **Workflow Engine nativo** — sem dependência de n8n; lógica em `src/lib/workflows/`
4. **Repository → Service → Route** — nunca acessar Supabase direto em route handlers

## Estrutura de Domínios

| Domínio | Repository | Service | Route |
|---------|-----------|---------|-------|
| Leads | `src/lib/repositories/lead.repository.ts` | `src/lib/services/` | `app/api/leads/` |
| Agente IA | — | `src/lib/ai/ai-agent.service.ts` | `app/api/agent/` |
| WhatsApp | — | `src/lib/integrations/whatsapp/` | `app/api/webhooks/evolution/` |
| Inbox | `src/lib/repositories/conversation.repository.ts` | — | `app/api/inbox/` |
| Clientes | (a criar) | (a criar) | `app/api/clientes/` |

## Segurança
- Toda API route valida sessão Supabase antes de operar
- Cron jobs autenticados via `CRON_SECRET` no header `Authorization`
- Webhook Evolution autenticado via `WEBHOOK_SECRET`
- Nenhuma chave exposta via `NEXT_PUBLIC_`

## Restrições
- **NÃO** usar Supabase direto em componentes React
- **NÃO** colocar lógica de agente IA em components
- **NÃO** criar tabelas sem RLS
- **NÃO** usar `any` em arquivos novos (legado tolerado temporariamente)
