# CLAUDE.md - LeadFinder Pro CRM

**AI Assistant Guide for LeadFinder Pro Development**

Last updated: 2026-10-30
Version: 2.0

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Directory Structure](#directory-structure)
5. [Development Workflows](#development-workflows)
6. [Key Conventions](#key-conventions)
7. [Database & Multi-tenancy](#database--multi-tenancy)
8. [Authentication & Security](#authentication--security)
9. [Common Tasks](#common-tasks)
10. [Troubleshooting](#troubleshooting)
11. [External Integrations](#external-integrations)

---

## Project Overview

**LeadFinder Pro** is a multi-tenant CRM platform for lead prospecting, management, and WhatsApp/email outreach.

### Core Features

- **Lead Prospecting**: Google Places and LinkedIn (Apify) channels
- **Multi-tenant Architecture**: Organization isolation with Row Level Security (RLS)
- **WhatsApp Integration**: AI-generated messages, dispatch via Evolution API or Meta Cloud API
- **Pipeline / Kanban, Inbox, Campaigns**: lead stages, conversations, email marketing
- **Analytics Dashboard**: metrics and charts
- **Data Enrichment**: Firecrawl for website analysis
- **Bulk Operations**: export, dispatch, delete

---

## Technology Stack

### Frontend / Server
- **Framework**: Next.js 14 (App Router) with TypeScript (`app/`, `middleware.ts`)
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 3.x
- **Charts**: Recharts
- **Animations**: Framer Motion
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React

### Backend
- **Database / Auth / Storage**: Supabase (PostgreSQL, Supabase Auth)
- **API**: Next.js Route Handlers in `app/api/*`
- **Business logic**: `src/lib/services`, `src/lib/repositories`

### Deploy
- **Current**: Vercel (`vercel.json`, Vercel Cron)
- **Target**: Cloudflare Workers via OpenNext (`wrangler.jsonc`, `open-next.config.ts`, `custom-worker.ts`). See `CLOUDFLARE_MIGRATION_PLAN.md`.

### Development Tools
- **Linter**: ESLint (`npm run lint`)
- **Tests**: Vitest (`npm test`)
- **Package Manager**: npm (package-lock.json present)
- **Type Checking**: TypeScript (currently `strict: false` in `tsconfig.json`; target: strict, no `any` in new code)

---

## Architecture

### Application Flow

```
Request
    ↓
middleware.ts (session refresh + route protection)
    ↓
app/(auth) | app/(protected) pages  /  app/api/* route handlers
    ↓
src/lib/services   (business rules)
    ↓
src/lib/repositories   (data access)
    ↓
Supabase (PostgreSQL + RLS)
```

Target layering for new code: components -> services -> repositories -> Supabase. Existing code does not fully follow it yet.

### Multi-Tenant Architecture

**CRITICAL**: tenancy is organization-based and enforced in the database:

1. **Tables**: `organizations` and `organization_members`
2. **Roles**: `admin`, `operador`, `visualizador` (see `GUIA_ROLES.md`)
3. **RLS**: enabled on all tables; policies scope rows to the user's organization
4. **Route handlers**: authenticate the user and resolve the organization before touching data
5. **Service role key**: server-only, used sparingly (admin tasks, webhooks, cron); never exposed to the client

---

## Directory Structure

```
prospect-pulse-54/
├── app/                     # Next.js App Router
│   ├── (auth)/              # Login / signup routes
│   ├── (protected)/         # Authenticated pages (dashboard, leads, kanban, inbox, ...)
│   ├── api/                 # Route handlers (leads, campaigns, whatsapp, webhooks, cron, ...)
│   ├── layout.tsx
│   └── providers.tsx
├── middleware.ts            # Auth/session middleware
├── lib/                     # Shared root-level helpers (constants, supabase clients)
├── src/
│   ├── components/          # React components (ui/ = shadcn)
│   ├── contexts/            # React contexts
│   ├── data/                # Static data
│   ├── hooks/               # Custom hooks
│   ├── integrations/        # supabase/client.ts and generated types.ts
│   ├── lib/                 # services/, repositories/, validations/, integrations/, guards/, ...
│   └── types/               # TypeScript types
├── supabase/                # config.toml, migrations/, functions/
├── docs/                    # Documentation (docs/sql-legado/ = legacy ad-hoc SQL, do not run blindly)
├── scripts/                 # Maintenance scripts (scripts/legacy/ = old test scripts)
├── tests/ e2e_tests/        # Unit and e2e tests
├── wrangler.jsonc           # Cloudflare Workers config
├── open-next.config.ts      # OpenNext config
├── custom-worker.ts         # Custom Worker entry (Cloudflare)
├── next.config.js
├── .env.example             # Environment variables template
└── package.json
```

### Key Directories

- **Unused Vite leftovers** (scheduled for removal): `vite.config.ts`, `index.html`, `src/App.tsx`, `src/main.tsx`, `tsconfig.app.json`, `tsconfig.node.json`

- **src/components/ui/**: shadcn/ui components; avoid editing directly
- **supabase/migrations/**: versioned schema evolution (currently incomplete vs. production, see Database & Multi-tenancy); never alter schema directly in production
- **docs/sql-legado/**: historical one-off SQL kept for reference only

---

## Development Workflows

### Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# Fill in values (never commit .env.local)

# 3. Start development server
npm run dev          # http://localhost:3000

# 4. Quality checks
npm run lint
npm test
npm run build        # Next.js production build
```

### Cloudflare (target deploy)

```bash
npm run cf:build     # OpenNext build for Workers
npm run cf:preview   # Build + local preview with wrangler
npm run cf:deploy    # Build + deploy (manual only)
```

### Git Branch Workflow

Work on feature branches (e.g. `claude/<topic>`); open PRs against `main`.

### Commit Message Conventions

Semantic commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.

---

## Key Conventions

### File Naming

- **Components**: PascalCase (e.g., `ProspectionForm.tsx`)
- **Hooks / utilities**: camelCase or kebab-case following neighbouring files
- **Services / repositories**: `<name>.service.ts`, `<name>.repository.ts`
- **Constants**: UPPER_SNAKE_CASE (in code)

### Styling Conventions

- **Tailwind classes** (no inline styles)
- **Mobile-first** responsive design (`className="text-sm md:text-base lg:text-lg"`)
- **Colors**: CSS variables (`hsl(var(--primary))`)
- **Dark mode**: via `darkMode: ["class"]`

### State Management

- **Server State**: TanStack Query
- **Local State**: useState, useReducer
- **Form State**: React Hook Form + Zod

### API Responses

Target convention for new code (existing routes do not all follow it yet): success `{ data, meta }`, error `{ error: { code, message } }`. Validate all inputs with Zod.

### Error Handling

```typescript
const { data, error } = await supabase.from('leads_prospeccao').select('*');
if (error) {
  console.error('Database error:', error);
  return { error: { code: 'DB_ERROR', message: 'Failed to load leads' } };
}
```

---

## Database & Multi-tenancy

The generated types in `src/integrations/supabase/types.ts` (client in `src/integrations/supabase/client.ts`) and the live database reflect the real schema. **`supabase/migrations/` is incomplete and is NOT the source of truth today**: production has schema not represented there (e.g. `leads_prospeccao.tenant_id`, trigger `set_tenant_and_origem_on_insert`). A baseline reconciliation is planned (Sprint 2). Until then, inspect the live schema (generated types or the database) before writing any migration. Do not copy table definitions into docs.

Rules:
- RLS enabled on every table, policies scoped by organization membership
- PK UUID (`gen_random_uuid()`), `created_at` / `updated_at` on every table
- Never alter production schema by hand; changes go through versioned migrations
- Legacy one-off scripts in `docs/sql-legado/` are historical only

### Production migration rule

Any migration, or any DELETE/UPDATE, on production requires:
1. The user's explicit authorization at that moment (prior approval does not carry over).
2. A rollback SQL in the same PR.
3. A prior export of the affected rows/definitions to `scripts/legacy/backup-<date>-<topic>.json` (git-ignored).

---

## Authentication & Security

### Authentication Flow

1. **Sign Up / Login**: email + password via Supabase Auth (`app/(auth)`)
2. **Session**: refreshed in `middleware.ts`
3. **Protected routes**: everything under `app/(protected)` and `app/api` (except webhooks/cron, which use their own secrets)
4. **Roles**: `admin`, `operador`, `visualizador` enforced in guards (`src/lib/guards`) and RLS

### Environment Variables

Names only (see `.env.example` for the full list and comments; never commit values):

```bash
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY      # server-only
NEXT_PUBLIC_APP_URL
FIRECRAWL_API_KEY
APIFY_API_KEY
WHATSAPP_PROVIDER              # "evolution" | "meta"
EVOLUTION_API_URL / EVOLUTION_API_KEY   # sem instância padrão: cada organização usa a própria
META_WA_TOKEN / META_WA_PHONE_NUMBER_ID / META_WA_VERSION / META_WA_VERIFY_TOKEN
RESEND_API_KEY
FROM_EMAIL
OPENAI_API_KEY
CRON_SECRET
```

### Security Best Practices

1. **Service role key only on the server**, never in client bundles or `NEXT_PUBLIC_*`
2. **Always resolve the user and organization** in route handlers before data access
3. **Enable RLS** on all tables
4. **Validate user input** with Zod before database operations
5. **Use parameterized queries** (Supabase client handles this)
6. **Verify secrets** on webhooks and cron endpoints (`CRON_SECRET`, webhook keys)
7. **Never commit .env files** (use .env.example)
8. `npm audit` clean before production deploy

---

## Common Tasks

### Adding a New Page

Create `app/(protected)/<route>/page.tsx` (server or client component), add the navigation entry in the sidebar component, and keep data access in services/repositories.

### Adding an API Route

Create `app/api/<name>/route.ts`: authenticate, validate input with Zod, call a service, return `{ data, meta }` or `{ error }`.

### Adding a UI Component

```bash
npx shadcn@latest add [component-name]
```

### Fetching Data with TanStack Query

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['leads'],
  queryFn: async () => {
    const res = await fetch('/api/leads');
    if (!res.ok) throw new Error('Failed to load leads');
    return res.json();
  },
});
```

### Creating a Database Migration

Inspect the live schema first (generated types or the database), since `supabase/migrations/` is incomplete. Write a versioned SQL file in `supabase/migrations/` (with RLS) plus its rollback SQL in the same PR, and regenerate types. Do NOT apply it to production on your own: follow the "Production migration rule" in Database & Multi-tenancy (explicit user authorization at that moment, rollback SQL, and a prior backup export).

---

## Troubleshooting

#### RLS policy errors
**Cause**: RLS disabled or policy missing/incorrect for the organization.
**Solution**: Review the migration for the table and confirm the user is in `organization_members` with the right role.

#### "Authentication required" on API routes
**Cause**: expired session or middleware not refreshing it.
**Solution**: Log out and in again; check `middleware.ts` matcher and cookies.

#### Cloudflare build failures
**Cause**: Node-only APIs not supported on Workers.
**Solution**: See `CLOUDFLARE_MIGRATION_PLAN.md`; check `wrangler.jsonc` compatibility flags.

### Debugging Tips

1. Browser console and Network tab
2. Supabase logs (Dashboard -> Logs)
3. Database policies (Dashboard -> Database -> Policies)
4. Verify environment variables in `.env.local`

---

## External Integrations

- **Supabase**: database, auth, storage
- **Google Places API / Apify**: prospecting channels
- **Firecrawl**: website enrichment (tenant key takes priority over env fallback)
- **OpenAI**: message and template generation
- **Evolution API / Meta Cloud API**: WhatsApp dispatch (`WHATSAPP_PROVIDER`)
- **Resend**: email marketing

See `EVOLUTION_API_CONFIG.md`, `CONFIGURACAO_EMAIL.md` and `GUIA_ROLES.md` for setup details.

---

## Development Guidelines for AI Assistants

1. **Read files before editing**
2. **Preserve existing patterns** and layer boundaries
3. **Test critical paths**: authentication, RLS, tenant isolation
4. **Update types** when the schema changes
5. **Check responsive design** (mobile-first)
6. **Verify multi-tenancy** in every data path
7. **TypeScript**: `strict` is currently off; write new code as if strict, no `any`

### Pull Request Checklist

- [ ] Follows existing conventions
- [ ] `npm run build` passes (and `npm run cf:build` for deploy-related changes)
- [ ] `npm run lint` and `npm test` pass
- [ ] Multi-tenancy preserved
- [ ] Documentation updated

---

**Repository**: prospect-pulse-54
**Version**: 2.0
