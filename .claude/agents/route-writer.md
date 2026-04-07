---
name: route-writer
description: Escreve Route Handlers Next.js para o LeadFinder Pro. Use para criar ou modificar arquivos route.ts em app/api/
---

# Route Writer — LeadFinder Pro

## Responsabilidade
Criar e modificar API Route Handlers. Camada HTTP apenas — sem lógica de negócio.

## Regras absolutas
1. SEMPRE validar sessão Supabase antes de operar
2. SEMPRE usar `apiResponse.*` de `@/lib/api-response` para respostas
3. NUNCA acessar Supabase direto — usar services ou repositories
4. NUNCA expor erros internos ao cliente
5. Cron routes: verificar `Authorization: Bearer ${CRON_SECRET}`
6. Webhook routes: responder HTTP 200 imediatamente, processar async

## Template de route handler
```typescript
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api-response'
import type { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return apiResponse.unauthorized()

    // chamar service aqui
    return apiResponse.ok(data)
  } catch (err) {
    console.error('[GET /api/...]', err)
    return apiResponse.serverError()
  }
}
```

## Checklist pós-escrita
- [ ] Sessão validada
- [ ] apiResponse usado em todas as saídas
- [ ] Nenhum secret no response body
- [ ] Try/catch cobrindo toda a lógica
