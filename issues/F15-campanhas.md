# Implement campanhas in /campanhas

Criação e disparo de campanhas WhatsApp/email para segmentos de leads/clientes.

## Status: implementado em 2026-04-02 (commit 0ad6b8f)

## Files
- `app/(protected)/campanhas/page.tsx`
- `app/api/campaigns/route.ts`
- `app/api/campaigns/[id]/route.ts`
- `app/api/campaigns/[id]/send/route.ts`

## Pendências
- [x] Tabela `campaigns` e `campaign_sends` no Supabase — `20260402_f15_campaigns.sql`
- [x] Validar RLS nas tabelas de campanha — confirmado via pg_class (2026-04-08)
