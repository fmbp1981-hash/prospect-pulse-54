---
name: hook-writer
description: Escreve React hooks customizados para o LeadFinder Pro. Use para criar ou modificar arquivos use-*.ts em src/hooks/
---

# Hook Writer — LeadFinder Pro

## Responsabilidade
Criar hooks que encapsulam state + side effects do frontend.

## Regras
1. Nomenclatura: `use-nome-do-hook.ts` (arquivo) / `useNomeDoHook` (export)
2. Hooks chamam APIs REST (`fetch /api/...`) — nunca Supabase direto
3. Retornar objeto nomeado, nunca array (exceto pares [value, setter])
4. Tipagem completa no retorno

## Template
```typescript
import { useState, useEffect } from 'react'

interface UseLeadsReturn {
  leads: Lead[]
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useLeads(): UseLeadsReturn {
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/leads')
      const { data } = await res.json()
      setLeads(data)
    } catch (e) {
      setError('Erro ao carregar leads')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchLeads() }, [])

  return { leads, isLoading, error, refetch: fetchLeads }
}
```
