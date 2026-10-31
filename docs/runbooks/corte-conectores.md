# Runbook — corte dos conectores por organização (Sprint 2b)

Troca das credenciais em `user_settings` (texto puro, por usuário) pelas
conexões cifradas por organização (`organization_connections` +
`platform_credentials`). Siga os passos **na ordem**. Cada passo marcado com
**[autorização do usuário]** só roda com autorização explícita do usuário
**naquele momento** (autorização anterior não vale) — regra de produção do
`CLAUDE.md`.

Convenções:

- Backups vão para `scripts/legacy/backup-<AAAA-MM-DD>-<tema>.json`
  (git-ignored). Alguns contêm segredo em texto puro: guarde fora do
  repositório depois do corte e apague ao fim do prazo de retenção.
- Nada aqui roda automaticamente. O agente prepara comandos; quem aprova é o
  usuário.
- Ambiente atual: Vercel. Quando o deploy migrar para Cloudflare, repita os
  passos de variáveis no Worker (`wrangler secret put`).

---

## 0. Pré-requisitos

- Branch `claude/sprint2b-conectores` revisada e aprovada (testes unitários,
  `npx tsc --noEmit`, `npm run build`).
- Branch `claude/sprint2b-limpeza-pos-corte` **não** é mergeada antes do
  passo 11.
- Acesso ao SQL Editor do Supabase de produção, ao painel da Vercel e aos
  painéis da Evolution API / Meta (WhatsApp Business) de cada cliente.

## 1. Aplicar a migration das conexões — [autorização do usuário]

Migration: `supabase/migrations/20261031100000_organization_connections.sql`
(cria `organization_connections` com `last_test_ok`, `platform_credentials`,
`usage_events`, `set_connection_webhook_key()` e o índice único da instância
Evolution).

1. Backup: a migration só cria objetos. Registre o estado atual em
   `scripts/legacy/backup-<data>-pre-conectores.json` (lista de tabelas e
   funções de `public`) para comparação.
2. Aplicar a migration.
3. Rodar em produção, em transação com `rollback` no fim (os scripts já fazem
   isso):
   - `tests/db/organization-connections.sql`
   - `tests/db/function-privileges.sql` (confere `set_connection_webhook_key`
     no **grupo A**: sem EXECUTE para `anon`/`authenticated`).
4. Ambos precisam terminar sem `EXCEPTION`.

Rollback: `supabase/migrations/rollback/20261031100000_organization_connections.down.sql`
(apaga conexões, credenciais e consumo; exporte as três tabelas antes).

## 2. Variáveis da chave mestra — [autorização do usuário]

1. Gerar a chave: `openssl rand -base64 32` (32 bytes em base64). Guarde no
   cofre de senhas; perder a chave = perder todos os segredos cifrados.
2. Na Vercel (Production e Preview):
   - `CONNECTORS_MASTER_KEY_V1` = valor gerado
   - `CONNECTORS_ACTIVE_KEY_VERSION` = `v1`
3. Depois, no Cloudflare (Worker), as mesmas duas variáveis como secrets.

Rollback: remover as variáveis (só antes de existir segredo cifrado gravado).

## 3. Credenciais da plataforma — [autorização do usuário]

Na tela de admin da plataforma (Integrações → Credenciais da plataforma),
cadastrar:

- **OpenAI** — `apiKey`
- **Resend** — `apiKey` + config `fromEmail` e `fromName` (e-mails de sistema
  da IntelliX)
- **Google Places** — `apiKey`
- **Apify** — `apiToken`
- **Firecrawl** — `apiKey`

Conexões `platform` das organizações só funcionam com estas credenciais.

## 4. Conferir a apikey da Evolution ANTES do deploy

A rota legada `/api/webhooks/evolution/<token>` agora exige que o header
`apikey` enviado pela Evolution seja igual à chave que ficará gravada na
conexão `evolution` da organização. Para cada cliente Evolution:

1. No painel da Evolution, conferir qual `apikey` o servidor envia nos
   webhooks (global ou da instância).
2. Confirmar que é a mesma chave hoje em `user_settings.evolution_api_key` do
   responsável pela organização (é ela que o script do passo 6 copia).
3. Se forem diferentes: anotar. A entrada do WhatsApp dessa organização
   responde **401 até a troca de URL do passo 8**. Ou se ajusta a chave antes,
   ou se faz os passos 6–8 dessa organização logo após o deploy.

## 5. Deploy do código das Tasks 1–11 — [autorização do usuário]

1. `npm audit` sem vulnerabilidades altas/críticas.
2. Deploy da branch aprovada (Vercel).
3. Smoke: login, tela de admin de integrações abre, `GET` da tela de status do
   cliente responde.

**Janela sem entrada de WhatsApp:** depois do deploy, a rota legada só
processa mensagens de organizações com conexão de WhatsApp `active`; sem ela,
responde 200 e descarta o evento. Faça os passos 6 e 7 logo em seguida, em
horário de baixo movimento, e avise os clientes.

Rollback: redeploy do deployment anterior na Vercel (as tabelas novas podem
ficar; o código antigo não as lê).

## 6. Migração assistida das conexões — [autorização do usuário no --apply]

O script lê `user_settings` do responsável de cada organização (admin mais
antigo; sem admin, membro mais antigo) e cria conexões `pending_test`. Nunca
sobrescreve conexão existente e nunca imprime segredo.

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
CONNECTORS_MASTER_KEY_V1=... CONNECTORS_ACTIVE_KEY_VERSION=v1 \
npx tsx scripts/migrate-connections.ts --dry-run
```

1. Rodar `--dry-run` e revisar a saída **com o usuário**:
   - `[criar]`: conexões que serão criadas (`own` = chave própria cifrada;
     `platform` = usa a credencial da plataforma).
   - `[manual]`: faltam campos. Casos esperados:
     - `whatsapp/meta_cloud` sempre falta `secret.appSecret` (não existe no
       legado): cadastrar a conexão Meta na tela de admin com todos os campos.
     - `email/resend` sem `from_email`: cadastrar domínio/remetente na tela.
     - `whatsapp/evolution` com `config.baseUrl` inválida (não https, IP
       privado): corrigir a URL na tela.
   - Usuários sem organização: listados e ignorados.
2. Backup antes do `--apply`: exportar `organization_connections` para
   `scripts/legacy/backup-<data>-organization-connections-pre-apply.json`.
3. Rodar com `--apply` (mesmo comando trocando a flag).
4. Rodar `--dry-run` de novo: tudo deve aparecer como `[existe]` (idempotente).

Rollback: apagar as linhas criadas pelo script (as que não existiam no backup
do item 2), por `id`, depois de exportá-las.

## 7. Testar e ativar cada conexão — [autorização do usuário]

Na tela de admin, para cada organização: **Testar** cada conexão; só com teste
aprovado o botão **Ativar** funciona (`last_test_ok`). Completar as conexões
marcadas como `[manual]` no passo 6. Organização sem conexão `active` em uma
categoria responde "não configurado" (sem fallback).

## 8. Trocar a URL do webhook nos provedores — [autorização do usuário]

Para cada conexão de WhatsApp, a tela de admin mostra a `webhookUrl`
(`<NEXT_PUBLIC_APP_URL>/api/webhooks/whatsapp/<webhook_key>`).

- **Evolution:** no painel da instância, trocar a URL do webhook para a
  `webhookUrl`.
- **Meta:** em WhatsApp → Configuration → Webhook, definir a callback URL =
  `webhookUrl` e o verify token = `verifyToken` da conexão; assinar o campo
  `messages`.
- Enviar uma mensagem de teste de um número externo e conferir a entrada no
  Inbox da organização certa.

Rollback: voltar a URL antiga no provedor (a rota legada continua no ar até o
passo 11).

## 9. Domínio do Resend por organização

Para cada organização com conexão de e-mail: o teste da conexão (passo 7)
confere se o domínio está verificado no Resend. Domínio não verificado =
teste reprovado e conexão não ativável; peça ao cliente para concluir a
verificação DNS no Resend e teste de novo.

## 10. Observar 24 h

- Logs da Vercel: erros `ConnectionNotConfiguredError`, 401 nos webhooks,
  falhas de envio.
- `usage_events`: consumo registrado por organização.
- Inbox e follow-ups das organizações com tráfego real.

### Mudanças de comportamento a comunicar aos clientes

- Etapas de follow-up longo com `requiresTemplate` são **puladas**
  (`template_required`) até existir HSM por organização: `no_response_initial`
  e `lost_reactivation` não enviam nada.
- Agendamentos legados de cenários que não são mais detectados são pulados.
- A prospecção não verifica mais se o número tem WhatsApp.
- A numeração `Lead-NNN` continua global (não por organização).

## 11. Limpeza pós-corte — [autorização do usuário + backup]

Só depois do passo 10 sem incidentes.

0. Portão de tráfego (antes de qualquer merge): logs de 24 h sem
   requisições em `/api/webhooks/evolution` e
   `/api/webhooks/evolution/<token>`; toda organização com conexão whatsapp
   `active` recebeu ao menos um evento pela `/api/webhooks/whatsapp/<key>`
   (ou confirmação manual no painel do provedor). Senão, voltar ao passo 8
   dessa organização.
1. Backups:
   - de `user_settings`, `user_id` + colunas listadas na migration para
     `scripts/legacy/backup-<data>-user-settings-credenciais.json`. **Contém
     segredos em texto puro**: mover para o cofre depois;
   - `pg_get_functiondef` de `handle_new_user_webhook`,
     `generate_user_webhook_url`, `get_user_by_webhook_url`,
     `get_user_by_evolution_instance`, a definição do trigger
     `trigger_new_user_webhook` e as linhas de `information_schema.columns`
     das colunas removidas para
     `scripts/legacy/backup-<data>-user-settings-funcoes.json` (os corpos
     dessas funções não estão versionados; a migration as remove).
2. Mergear `claude/sprint2b-limpeza-pos-corte` (remove a rota legada
   `/api/webhooks/evolution`, `resolveTenantByWebhookToken`, leituras de
   colunas de segredo e as variáveis antigas da documentação) e fazer deploy.
3. Aplicar `supabase/migrations/20261031110000_drop_plaintext_integration_columns.sql`.
   Ela aborta (sem aplicar nada) se alguma outra função do `public` ainda
   citar uma coluna removida, ou se houver view/policy dependente.
   Aplicar o arquivo inteiro numa única execução (`supabase db push` ou um
   único Run no SQL Editor), nunca por trechos.
4. Rodar `tests/db/drop-plaintext-integration-columns.sql`,
   `tests/db/function-privileges.sql` e
   `tests/db/evolution-instance-isolation.sql` (todos ok / 0 violações).
5. Regenerar `src/integrations/supabase/types.ts` e conferir que não há diff
   relevante em relação ao commit de limpeza.
6. `/api/admin/register-templates` passa a usar a conexão `meta_cloud` ativa
   da organização IntelliX (cadastrar antes de chamar).

Rollback: `supabase/migrations/rollback/20261031110000_drop_plaintext_integration_columns.down.sql`
recria as colunas (vazias); os dados voltam do backup do item 1. Redeploy do
código anterior à limpeza.

**Atenção:** depois de aplicada a 20261031110000, os rollbacks mais antigos
(`20261030120000`, `20261030140000` e `20261030150000` `.down.sql`) não podem
ser rodados sem antes rodar
`20261031110000_drop_plaintext_integration_columns.down.sql` (eles citam
colunas e funções que a limpeza remove).

## 12. Remoções manuais pelo usuário — [autorização do usuário]

- Supabase: apagar a edge function publicada `prospection` e os secrets dela.
- Vercel (e Cloudflare, se já configurado): apagar `WHATSAPP_PROVIDER`,
  `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_DEFAULT_INSTANCE`,
  `META_WA_TOKEN`, `META_WA_PHONE_NUMBER_ID`, `META_WA_VERSION`,
  `META_WA_VERIFY_TOKEN`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`,
  `FIRECRAWL_API_KEY`, `APIFY_API_KEY`.

## Critério de saída (itens que dependem de produção)

- [ ] Duas organizações reais trocando mensagens, cada uma na sua conexão.
- [ ] RLS de `organization_connections` / `platform_credentials` verificada em
      produção (`tests/db/organization-connections.sql`).
- [ ] Nenhum segredo legível por `authenticated`.
