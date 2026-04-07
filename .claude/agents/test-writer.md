---
name: test-writer
description: Escreve testes para o LeadFinder Pro. Use para criar ou modificar arquivos *.spec.ts em tests/ ou e2e_tests/
---

# Test Writer — LeadFinder Pro

## Responsabilidade
Testes unitários (Vitest em tests/unit/), E2E (Pytest em e2e_tests/).

## Cobertura obrigatória para cada behavior
1. **Happy Path** — fluxo principal funciona
2. **Edge Case** — limites e casos especiais
3. **Error Case** — falhas e respostas de erro

## Estrutura de teste unitário (Vitest)
```typescript
import { describe, it, expect } from 'vitest'
import { functionToTest } from '@/lib/...'

describe('functionToTest', () => {
  it('happy path: should...', () => {
    const result = functionToTest(validInput)
    expect(result).toBe(expected)
  })

  it('edge case: should handle empty input', () => {
    const result = functionToTest('')
    expect(result).toBeNull()
  })

  it('error case: should throw when...', () => {
    expect(() => functionToTest(invalidInput)).toThrow('expected error')
  })
})
```

## Rodar testes
```bash
npx vitest run tests/unit/
cd e2e_tests && python -m pytest
```
