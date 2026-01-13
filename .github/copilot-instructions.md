# Copilot Instructions for AI Coding Agents

## Project Overview
- **LeadFinder Pro CRM**: Multi-tenant CRM for lead prospecting, management, and WhatsApp outreach.
- **Stack**: React (Vite, TypeScript), Supabase (PostgreSQL, Edge Functions), shadcn/ui, TanStack Query, Tailwind CSS.
- **Key Features**: Google Places API integration, WhatsApp automation, analytics dashboard, RLS-secured multi-tenancy, Firecrawl enrichment.

## Architecture & Directory Structure
- **Frontend**: `src/` (components, hooks, contexts, integrations, types, pages)
  - `src/components/ui/`: shadcn/ui (do not edit directly)
  - `src/integrations/supabase/types.ts`: auto-generated from Supabase
- **Backend**: `supabase/functions/` (Edge Functions), `supabase/migrations/` (never edit manually)
- **Data Flow**: React → TanStack Query → Supabase client → Edge Functions → DB
- **Multi-Tenancy**: Enforced via RLS, triggers, and policies (see `CLAUDE.md` for details)

## Developer Workflows
- **Local Dev**: `npm install` → `cp .env.example .env` → edit env vars → `npm run dev`
- **Build**: `npm run build` (see also VS Code task: Next.js Build)
- **Supabase Edge Functions**: Deploy/test via `supabase functions deploy/serve prospection`
- **Branch Naming**: Use `claude/` prefix for feature branches
- **Migrations**: Only via Supabase dashboard; never edit migration files directly

## Project Conventions
- **Component Naming**: PascalCase for components/types, camelCase for hooks/utils
- **Styling**: Tailwind only, mobile-first, use CSS variables for colors
- **State**: TanStack Query (server), React Context (global), useState/useReducer (local)
- **Error Handling**: Always check for Supabase errors, use toast notifications (see `App.tsx`)
- **Toast**: Prefer `react-hot-toast` for real-time feedback

## Integration Points
- **Google Places API**: Used in Edge Functions for lead search
- **Firecrawl API**: Website enrichment (optional)
- **Lovable AI Gateway**: WhatsApp message generation (optional)
- **Evolution API**: WhatsApp dispatch (optional, see `GUIA_INTEGRACAO_N8N.md`)

## Common Tasks
- **Add Page**: Create in `src/pages/`, add route in `App.tsx`, link in sidebar
- **Add UI Component**: Use shadcn/ui CLI or add to `src/components/`
- **Fetch Data**: Use TanStack Query with Supabase client
- **Quick Selects**: Edit `src/data/prospectionQuickSelects.ts`

## Security & Auth
- **Never use Supabase service role key in Edge Functions**
- **Always pass Authorization header** to Edge Functions
- **RLS must be enabled on all tables**
- **.env**: Never commit secrets; use `.env.example` as template

## Troubleshooting & Testing
- **Check**: Supabase logs, browser console, network tab
- **Debug**: See `CLAUDE.md` and `GUIA_TESTE_FINAL.md` for common issues and test flows
- **Responsive**: Test on mobile, tablet, desktop

## Documentation
- **Reference**: `CLAUDE.md` (AI conventions, architecture, troubleshooting)
- **Other Guides**: `README.md`, `GUIA_*.md` files for integration and setup

---

*For more, see `CLAUDE.md` and project guides. Update this file as project structure or conventions evolve.*
