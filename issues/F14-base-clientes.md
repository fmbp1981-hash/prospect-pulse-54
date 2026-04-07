# Implement base-de-clientes in /clientes

Repositório permanente de clientes convertidos, separado do funil `leads_prospeccao`.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Behaviors implementados
- **converter-lead**: lead → cliente (copia dados, cria histórico, remove do funil)
- **listar-clientes**: GET /api/clientes com busca e filtro
- **editar-cliente**: PATCH /api/clientes/[id]
- **devolver-cliente**: reprospectar cliente como novo lead

## Files
- `app/(protected)/clientes/page.tsx`
- `app/api/clientes/route.ts`
- `app/api/clientes/[id]/route.ts`
- `app/api/clientes/converter/route.ts`
- `app/api/clientes/[id]/devolver/route.ts`

## Pendências
- [ ] Criar `supabase/migrations/` para tabelas `clientes` e `cliente_historico`
- [ ] Validar que RLS está ativo nessas tabelas
