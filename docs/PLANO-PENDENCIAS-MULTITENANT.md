# Plano — Pendências pós Multi-Tenant (PR #7)

Status: planejamento, nenhuma implementação ainda. Este documento cobre as 3
pendências deixadas em aberto pelo PR #7 (fundação multi-tenant). Não inclui
nada de UI/design — isso fica para uma revisão à parte, a pedido do usuário.

---

## 1. Compartilhamento real de dados entre membros de uma organização

### Problema
A fundação de RLS (organizations/organization_members/organization_id) já
está pronta e testada, mas ~33 arquivos de repositório/rota ainda filtram
consultas explicitamente por `.eq('user_id', userId)` em vez de
`organization_id`. Resultado: mesmo dois usuários da mesma empresa (mesma
`organization_id`) não veem os leads, campanhas, templates etc. um do outro
na UI hoje — a RLS permitiria, mas o código de aplicação nunca pede.

### Pré-requisito antes de começar
Precisa de um cenário real com **2+ usuários numa mesma organização** para
testar contra (hoje só `contato@intellixai.com.br` está na IntelliX.AI). Sem
isso, qualquer mudança aqui é especulativa e não-testável de ponta a ponta.
Convidar um segundo usuário de teste para a organização é o primeiro passo
concreto, não uma migration.

### Abordagem recomendada
1. **Levantamento**: `grep -rln "\.eq('user_id'" app src` para listar os ~33
   arquivos exatos (a contagem pode ter mudado desde a estimativa original).
   Classificar cada um em 3 grupos:
   - **Repository/service layer** (ex: `src/lib/repositories/*.ts`) — ponto
     certo para a mudança, centraliza o filtro.
   - **Rotas API que ainda fazem query direta** sem passar por repository —
     candidatas a refatorar para usar repository, não só trocar o filtro.
   - **Rotas via service role** (n8n/webhooks) — não filtram por `user_id`
     hoje porque usam service role + RLS bypass; aqui o filtro precisa ser
     explícito no código já que RLS não ajuda.
2. **Padrão de substituição**: em vez de `.eq('user_id', userId)`, resolver
   a `organization_id` do usuário autenticado no backend (nunca aceitar do
   client) via uma função utilitária `getOrganizationId(userId)` que chama
   `organization_members`, e filtrar por `.eq('organization_id', orgId)`
   quando o usuário tiver organização, com fallback para
   `.eq('user_id', userId)` quando não tiver (preserva o comportamento atual
   para quem ainda não está em nenhuma organização — a maioria da base).
3. **Ordem de migração sugerida** (menor risco → maior risco):
   - Leitura (SELECT) primeiro, tabela por tabela — baixo risco, reversível.
   - Escrita (INSERT/UPDATE/DELETE) depois — já protegida pelas policies
     `is_org_writer` do PR #7, mas o código de aplicação precisa passar a
     `organization_id` certa nos inserts.
   - Priorizar `leads_prospeccao`, `campaigns`, `message_templates` (as
     tabelas onde o valor de "ver o trabalho do colega" é mais óbvio) antes
     de tabelas de auditoria/configuração.
4. **Teste de regressão obrigatório por tabela migrada**: com 2 usuários reais
   na mesma organização, confirmar que ambos veem os dados um do outro; com 2
   usuários em organizações diferentes, confirmar que continuam isolados
   (reaproveitar o padrão de simulação SQL `SET LOCAL request.jwt.claims`
   usado na verificação do PR #7).

### Estimativa
Trabalho médio/grande — não é uma tarde. Recomendo tratar como um PR por
grupo de tabelas relacionadas (ex: "leads + campanhas", depois "templates +
mensagens"), não um PR gigante único.

---

## 2. Fluxo de aprovação de novos usuários pendentes

### Problema
Todo novo signup cai em `user_settings.pending_setup = true` e fica preso em
`/pending` até alguém rodar SQL manual para aprovar. Não existe hoje nenhuma
tela para um admin ver a fila de pendentes e aprovar/rejeitar.

### Abordagem recomendada
1. **Schema**: nenhuma mudança necessária — `pending_setup` e `role` já
   existem em `user_settings`.
2. **Rota de listagem**: `GET /api/admin/pending-users` — retorna usuários
   com `pending_setup = true` **da mesma organização** do admin que chama
   (usar `organization_id`, não listar pendentes de outras empresas — isso
   seria um vazamento cross-tenant se implementado errado).
3. **Rota de aprovação**: `PATCH /api/admin/pending-users/:userId` —
   `{ action: 'approve' | 'reject', role?: 'admin' | 'operador' | 'visualizador' }`.
   Approve seta `pending_setup = false` e opcionalmente ajusta `role`. Reject
   pode: (a) deletar o usuário do Supabase Auth, ou (b) só marcar como
   rejeitado sem deletar — decisão de produto, não técnica; perguntar ao
   usuário qual comportamento ele quer antes de implementar.
4. **Autorização**: só `role = 'admin'` da própria organização (ou o admin de
   plataforma) pode chamar essas rotas — checar via `is_org_admin()` (já
   existe desde o PR #7).
5. **UI**: uma tela simples em `/configuracoes` ou uma seção nova
   `/usuarios-pendentes`, visível só para admins — mas como o usuário pediu
   para não mexer em UI agora, isso fica para depois da revisão de design.
6. **Notificação (opcional, fase 2)**: e-mail para o admin quando um novo
   usuário se cadastra pendente, e para o novo usuário quando é aprovado —
   reaproveitar o padrão de e-mail já usado no projeto (Resend, conforme
   `user_settings.resend_api_key`).

### Estimativa
Pequeno — 1 sessão. É o item de menor esforço com maior valor imediato (sem
ele, o cadastro construído no PR #7 fica com um beco sem saída operacional).

---

## 3. Rate limiting na rota pública `/api/admin/init-user-settings`

### Problema
A rota é pública por necessidade (roda antes do usuário ter `user_settings`),
já tem proteção de IDOR (exige Bearer token validado contra o `userId` do
corpo, desde a correção do PR #7), mas não tem limite de taxa — um script
pode tentar sign-up em massa via Supabase Auth e martelar essa rota.

### Abordagem recomendada
1. Verificar se o projeto já usa alguma solução de rate limiting em outra
   rota pública (`/api/webhooks/`, `/api/cron/`) antes de introduzir uma
   dependência nova — reaproveitar o padrão existente se houver.
2. Se não houver nada hoje: **Upstash Ratelimit** é a opção mais simples para
   Next.js em Edge/Serverless (sliding window por IP, ou por `userId` já que
   a rota agora exige token). Confirmar com o usuário se já existe conta
   Upstash configurada ou se precisa provisionar (isso é uma integração nova,
   ver skill `marketplace` do plugin Vercel antes de escolher provedor).
3. Limite sugerido inicial: 5 tentativas por `userId`/IP a cada 10 minutos —
   generoso o bastante para um signup legítimo com retry, apertado o
   suficiente para dificultar abuso automatizado.

### Estimativa
Pequeno, mas depende de decisão de infraestrutura (Upstash ou equivalente)
antes de codar — perguntar ao usuário antes de escolher o provedor.

---

## Ordem sugerida de execução

1. **Fluxo de aprovação de usuários pendentes** (item 2) — menor esforço,
   maior valor, sem dependências externas.
2. **Rate limiting** (item 3) — pequeno, mas primeiro confirmar provedor.
3. **Compartilhamento real de dados** (item 1) — maior esforço, e só faz
   sentido priorizar quando houver um segundo usuário real numa organização
   para validar contra.

Nenhum desses itens depende de decisão de UI/design — todos são
backend/RLS/rotas. A revisão de UI mencionada pelo usuário pode acontecer em
paralelo ou depois, sem bloquear este plano.
