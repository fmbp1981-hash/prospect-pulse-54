# Task 3 - Relatório

## Implementado
- `src/lib/connectors/types.ts`, `schemas.ts` (Zod por provedor; evolution.baseUrl via assertSafeOutboundUrl; resend valida fromEmail no domain), `resolve-connection.ts`, `org-context.ts`, `usage.ts`
- `src/lib/repositories/connections.repository.ts` (service role; `listForOrganization` com colunas explícitas, sem secret/webhook_key; findActive filtra organization_id+category+status='active'[+provider]; findByWebhookKey usa neq status disabled)
- Testes: `tests/unit/connectors-resolve.spec.ts`, `tests/unit/connectors-usage.spec.ts` (17 casos)

## Resultados
- `npx vitest run tests/unit/connectors-*.spec.ts` -> 17/17 passam
- Suíte unit: 333 passam, 1 falha (pré-existente normalizer.spec.ts). `tsc --noEmit` sem erros.

## TDD
RED não registrado: implementação foi escrita antes dos testes (desvio do passo 1-2 do brief). Testes verificam comportamento (filtros registrados pelo fake, decifragem real via encryptJson).

## Notas
- `findOrganizationIdForUser` fica no repositório (org-context só delega), mantendo camadas.
- Linhas do DB mapeadas para ResolvedConnection com um cast único em buildResolved (tipos do DB são `string`).
- Em `repository.upsert` o retorno é o resumo seguro (sem secret).
- Erros de decifragem/Zod propagam (ZodError), não viram ConnectionNotConfiguredError.

## Fix round 1
- I1: `resolveConnection` ganhou overloads (provider obrigatório em tipo para `prospecting`) e checagem em runtime com erro claro, sem consultar o banco. `findActive` converte PGRST116 (múltiplas linhas) em erro explícito "mais de uma conexão ativa; informe o provedor". +3 testes.
- I2: insert movido para `connectionsRepository.insertUsage`; `recordUsage` só faz try/catch + log mascarado.
- Comando: `npx vitest run tests/unit/connectors-resolve.spec.ts tests/unit/connectors-usage.spec.ts` -> 20/20 passam; `npx tsc --noEmit` sem erros.
