# LeadFinder Pro — Design Reference

## Paleta de Cores (Shadcn/UI — Dark Mode Default)
- Background: `hsl(var(--background))` — slate-950
- Foreground: `hsl(var(--foreground))` — slate-50
- Primary: indigo-600 / `hsl(var(--primary))`
- Destructive: red-500
- Border: slate-800
- Card: slate-900

## Tipografia
- Font: Inter (sistema — não carregada externamente)
- Heading: font-semibold, tracking-tight
- Body: text-sm, text-muted-foreground para secundário

## Componentes UI
- Biblioteca base: Shadcn/UI (Radix UI primitives)
- Localização: `src/components/ui/` — **nunca editar diretamente**
- Ícones: Lucide React

## Padrões de Layout
- Sidebar: AppSidebar (collapsible, 240px expandido / 60px colapsado)
- Main content: padding p-4 md:p-6
- Cards: rounded-lg border bg-card shadow-sm
- Mobile-first: breakpoints sm (640) / md (768) / lg (1024)

## Animações
- Biblioteca: Framer Motion
- Utilitários: `src/lib/animations.ts`
- Padrão: fade-in 200ms ease-out para modais e drawers

## Formulários
- Hook: React Hook Form + Zod resolver
- Validação: Zod schemas em `src/validations/`
- Feedback: Toast (Sonner) para sucesso/erro
