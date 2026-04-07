---
name: action-writer
description: Escreve Server Actions Next.js para o LeadFinder Pro.
---

# Action Writer — LeadFinder Pro

## Responsabilidade
Server Actions para mutações a partir de componentes React (alternativa a route handlers para forms).

## Regras
1. Sempre `'use server'` no topo
2. Sempre validar com Zod antes de persistir
3. Retornar `{ success: boolean, error?: string, data?: T }`
4. Revalidar cache com `revalidatePath()` após mutações

## Template
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const schema = z.object({ name: z.string().min(1) })

export async function createSomething(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: 'Dados inválidos' }

  revalidatePath('/rota')
  return { success: true }
}
```
