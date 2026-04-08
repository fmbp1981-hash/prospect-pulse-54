# MASTER-ARCHITECTURE.md — LeadFinder Pro

## Stack Canônica
- **Framework**: Next.js 14+ (App Router)
- **Linguagem**: TypeScript strict (`"strict": true`, zero `any`)
- **Estilo**: Tailwind CSS + Shadcn/UI
- **Banco**: Supabase (PostgreSQL + Auth + RLS)
- **Validação**: Zod em todas as entradas

## Estrutura de Pastas Canônica
```
app/
  (auth)/           # Páginas públicas de autenticação
  (protected)/      # Páginas que requerem login
  api/              # API Routes Next.js
src/
  components/
    layout/         # AppSidebar, Layout, Logo, NavLink, ThemeToggle
    shared/         # Componentes reutilizáveis
    ui/             # Primitivos Shadcn/UI
    dashboard/      # Componentes do dashboard
    inbox/          # Componentes de inbox
    leads/          # Componentes de leads
  lib/
    ai/             # Serviços de IA
    integrations/   # Clientes externos (Evolution, OpenAI)
    workflow-engine/ # Motor de workflows
    workflows/      # Definições de workflows
    jobs/           # Cron jobs
    guards/         # Guards de segurança
    handlers/       # Handlers de eventos
    utils/          # Utilitários
  repositories/     # Acesso a dados
  services/         # Lógica de negócio
  types/            # TypeScript types
  validations/      # Schemas Zod
lib/
  supabase/         # Clientes Supabase server-side
supabase/
  migrations/       # Migrations SQL versionadas
  functions/        # Edge Functions
```

## Naming Conventions
- Componentes: `PascalCase.tsx`
- Services: `kebab-case.service.ts`
- Repositories: `kebab-case.repository.ts`
- Hooks: `useNomeHook.ts`
- Schemas Zod: `nome.schema.ts`
- Migrations: `YYYYMMDD_descricao.sql`

## Padrões de Código
- `export async function` em API routes
- `'use client'` apenas em componentes com hooks de browser
- RLS ativo em todas as tabelas Supabase
- Commits semânticos: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`

## Design System — Precision Dark

### Tokens de cor disponíveis no Tailwind (tailwind.config.ts)
- `background`, `foreground`, `surface`, `raised`, `overlay`, `hover`
- `border`, `border-default`, `border-strong`, `input`, `ring`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `muted`, `muted-foreground`
- `accent`, `accent-foreground`
- `destructive`, `destructive-foreground`, `destructive-muted`
- `success`, `success-foreground`, `success-muted`
- `warning`, `warning-foreground`, `warning-muted`
- `info`, `info-foreground`, `info-muted`
- `card`, `card-foreground`, `popover`, `popover-foreground`
- `sidebar.*` (background, foreground, primary, accent, border, ring)

### Especificações de componentes
- **Badge**: `rounded` (4px), `font-mono text-2xs`, border de 1px, variantes: default/secondary/destructive/outline/success/warning/info, sem rounded-full
- **Button**: `rounded` (4px), sem `hover:scale`, sem `motion.div` wrapper, `text-sm font-medium`, variantes: default/destructive/outline/secondary/ghost/link
- **Card**: `rounded-lg` (6px), `border border-border`, sem `shadow-sm`, `bg-card`
- **Input**: `rounded` (4px), `border border-input`, `bg-raised`, `text-sm font-ui`
- **Topbar**: `h-[52px]`, sticky, breadcrumb em `font-mono text-xs`
- **Sidebar**: preta, nav items com `border-l-2`, labels em `font-mono text-2xs uppercase`

### Princípios
- Fonte UI: IBM Plex Sans
- Fonte Dados/Números: IBM Plex Mono
- Accent primário: Âmbar `#D97706`
- Fundo base: `#0A0B10`
- Border radius: 4px máximo (6px para cards)
- Cards: `border 1px solid` em vez de `box-shadow`
- Animações: `fade` sutil (150-180ms), sem slides, sem bounces, sem `hover:scale`
- Opacidade com `/` do Tailwind é permitida (ex: `bg-primary/10`)
