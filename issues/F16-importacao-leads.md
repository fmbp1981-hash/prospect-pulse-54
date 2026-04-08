# Implement importacao-de-leads in /leads

Importar leads em massa via CSV, XLSX, VCF ou TXT.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Files
- `app/api/leads/import/route.ts`

## Pendências
- [x] Confirmar componente ImportLeadsModal implementado no frontend — `src/components/leads/ImportLeadsModal.tsx`
- [x] Validar normalização de telefone BR → +55XXXXXXXXXXX — `src/lib/normalizePhone.ts` existe
