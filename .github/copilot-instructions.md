# Copilot Instructions

LeadFinder Pro is a multi-tenant CRM for lead prospecting and WhatsApp outreach. `CLAUDE.md` is the source of truth for architecture, conventions and troubleshooting; read it first.

## Stack and layout
- Next.js 14 App Router with TypeScript: pages in `app/`, auth/session in `middleware.ts`.
- API: route handlers in `app/api/*`.
- Business logic: services and repositories in `src/lib/` (components -> services -> repositories -> Supabase; do not skip layers).
- UI: shadcn/ui (`src/components/ui/`, avoid editing), Tailwind mobile-first, TanStack Query.
- Generated Supabase types: `src/integrations/supabase/types.ts`.

## Data and security
- Supabase (PostgreSQL, Auth) with organization-based multi-tenancy; RLS on every table.
- The `service_role` key is used only server-side (route handlers/services), never in client code.
- Validate all inputs with Zod. Never commit secrets; use `.env.example` as the template.
- `supabase/migrations/` is incomplete versus production. Inspect the live schema before writing migrations, and never apply migrations or run DELETE/UPDATE on production without the user's explicit authorization (see `CLAUDE.md`).

## Conventions
- Work on feature branches prefixed `claude/`.
- Semantic commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- No n8n dependencies and no client-specific names in code, prompts or docs.
- Run `npm run lint`, `npx tsc --noEmit` and `npm test` before opening a PR.
