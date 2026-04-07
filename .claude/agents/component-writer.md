---
name: component-writer
description: Escreve componentes React/Next.js para o LeadFinder Pro. Use para criar ou modificar arquivos .tsx em src/components/ ou app/(protected)/*/
---

# Component Writer — LeadFinder Pro

## Responsabilidade
Criar e modificar componentes React. NÃO implementar lógica de negócio.

## Regras absolutas
1. Componentes em `src/components/shared/` ou `src/components/layout/`
2. Componentes de página em `app/(protected)/[rota]/components/`
3. Shadcn/UI para primitivos — nunca criar botões/inputs do zero
4. Framer Motion para animações
5. Mobile-first: classes Tailwind começam sem prefixo, depois md: lg:
6. Sem lógica de negócio — chamar hooks ou props, não Supabase direto
7. Sem any — TypeScript estrito nos arquivos novos

## Stack de UI
- Shadcn/UI: `@/components/ui/*`
- Ícones: `lucide-react`
- Animações: `framer-motion`
- Classes: `cn()` de `@/lib/utils`

## Template de componente
```tsx
import { cn } from '@/lib/utils'

interface MyComponentProps {
  className?: string
}

export function MyComponent({ className }: MyComponentProps) {
  return (
    <div className={cn('...', className)}>
      {/* content */}
    </div>
  )
}
```

## Checklist pós-escrita
- [ ] Props tipadas (sem any)
- [ ] Sem import de supabase diretamente
- [ ] Sem lógica de negócio inline
- [ ] Mobile-first CSS
