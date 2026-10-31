# Conectores por organização (Sprint 2b) — design

**Data:** 2026-10-31 · **Projeto:** prospect-pulse-54 (LeadFinder Pro) · **Plano-mãe:** `docs/superpowers/plans/2026-10-30-ajuste-sistema-e-migracao-cloudflare.md` (seção SPRINT 2b)
**Ordem acordada:** Sprint 2b (este) → Sprint 2c (perfil da organização e onboarding guiado, design próprio) → demais sprints do plano (Next 16, Cloudflare, qualidade). O Sprint 2b foi antecipado para antes do Next 16.

## 1. Intenção e porquê

A plataforma é vendida como **serviço**: a IntelliX faz o onboarding de cada empresa cliente junto com ela e opera a prospecção. Hoje o sistema está amarrado a serviços e instâncias fixas:
- provedor de WhatsApp escolhido por `WHATSAPP_PROVIDER` no ambiente, um só para a plataforma inteira (`src/lib/integrations/whatsapp/whatsapp.factory.ts`; Meta desativado no Sprint 1 por enviar em nome de todos);
- URLs e chaves de Evolution, Meta, Resend, OpenAI, Firecrawl, Apify e Google lidas de `process.env` em ~18 arquivos (`git grep -nE "process\.env\.(EVOLUTION|META_WA|RESEND|OPENAI|FIRECRAWL|APIFY|GOOGLE|WHATSAPP_PROVIDER|FROM_EMAIL)"`);
- chaves por usuário **em texto puro** em `user_settings` (`evolution_api_key`, `resend_api_key`, `openai_api_key`, `apify_api_key`, `firecrawl_api_key`, `business_access_token`, `zapi_token`, …);
- o recebimento de mensagens pela Meta Cloud API não funciona (payload Meta é descartado como "tipo não suportado").

Objetivo: cada organização tem as **suas conexões**, escolhidas e configuradas pela equipe IntelliX; nada no código fica preso a um serviço, instância ou número.

## 2. Decisões do usuário (fixas)

1. **Provedor primeiro, credenciais depois.** Organização nasce **sem nenhuma conexão**. Envio de WhatsApp, follow-up, campanhas, e-mail e agente ficam **desligados, com aviso claro na tela**, até o admin da plataforma escolher o provedor e salvar credenciais que passem no teste de conexão.
2. **Nenhum padrão fixo:** nenhuma instância, número ou provedor default em código, ambiente ou banco (a antiga instância `WA-Pessoal` e `EVOLUTION_DEFAULT_INSTANCE` já foram removidas).
3. **Quem configura:** só a equipe IntelliX (admin da plataforma, allowlist `public.platform_admins`), durante o onboarding, junto com o cliente. O cliente **vê o status** das conexões e **não altera nada** (por enquanto, nem reconexão de QR code).
4. **WhatsApp:** Meta Cloud API preferencial; Evolution para testes; sempre credencial **da organização** (o número é do cliente).
5. **Custo variável embutido no plano:** OpenAI, Google Places, Apify, Firecrawl e Resend usam **contas da IntelliX** por padrão.
6. **E-mail sempre com o domínio do cliente** (ex.: `vendas@empresadocliente.com.br`), verificado na conta Resend da IntelliX; Resend é o padrão, mas trocável.
7. **Apollo**: não será usado agora (custo), mas a categoria de prospecção deve aceitá-lo depois como mais um provedor. Outros meios de prospecção serão informados depois.
8. **Sem n8n.**

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Registro mínimo de consumo por organização (4.6).
- Modelo de conexões por organização, com categorias e provedores plugáveis (portas + adapters).
- Credenciais da plataforma (contas IntelliX) e credenciais da organização, ambas criptografadas e nunca devolvidas ao navegador.
- Todo código que age em nome de uma organização resolve provedor e credencial pela organização (do lead, da campanha, da conversa).
- WhatsApp Meta funcionando ponta a ponta (envio **e** recebimento) e Evolution funcionando, ambos por organização.
- Tela do admin da plataforma para configurar e testar conexões de qualquer organização; tela de status (somente leitura) para o cliente.

**Não-objetivos (ficam para depois)**
- Perfil da organização, ICP, tom de voz, oferta, passagem para o vendedor → **Sprint 2c**.
- Conectores de CRM do cliente e de agenda (Google/Outlook) → futuro; o modelo deve comportá-los como categorias novas sem refazer nada.
- Cotas e cobrança por plano.
- Autosserviço do cliente (trocar/reconectar sozinho).
- Apollo e outros provedores de prospecção ainda não definidos.

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Qualquer caminho em que uma organização envie mensagem/e-mail pelo número, instância, domínio ou conta de outra.
- Segredo legível pelo cliente (navegador, resposta de API, log, RLS frouxa).
- Fallback silencioso para variável de ambiente ou para "a primeira conexão que existir" quando a organização não tem conexão.
- Quebrar o tenant que já opera hoje sem um caminho de migração dos dados atuais.

## 4. Modelo

### 4.1 Categorias e provedores (agora)

| Categoria | Provedores agora | Dono padrão da credencial | Futuro |
|---|---|---|---|
| `whatsapp` | `meta_cloud` (preferencial), `evolution` (teste) | organização | outros (Z-API etc. só se pedido) |
| `email` | `resend` | plataforma (conta IntelliX) + **domínio da organização** | SMTP/SES/outros |
| `llm` | `openai` | plataforma | outros provedores |
| `prospecting` | `google_places`, `apify` (LinkedIn), `firecrawl` (enriquecimento) | plataforma | `apollo` e outros |
| `crm`, `calendar` | — (não implementar) | — | categorias futuras |

### 4.2 Conexão da organização

Para cada (organização, categoria) existe no máximo **uma conexão ativa**. Uma conexão tem:
- provedor;
- **Evolution (decisão do executor):** a conexão guarda URL e API key da Evolution (normalmente o servidor da IntelliX) + nome da instância exclusivo da organização (índice único, como no Sprint 1). Como a API key global de um servidor Evolution acessa qualquer instância dele, o isolamento é garantido pelo app (só admin da plataforma configura; cliente nunca vê a chave) e a Evolution segue **só para testes**; clientes em produção usam Meta Cloud API;
- **origem da credencial**: `platform` (usa a credencial da plataforma daquele provedor) ou `own` (credencial própria da organização). WhatsApp é sempre `own`;
- configuração não-secreta (ex.: `phone_number_id`, `waba_id`, nome da instância Evolution, URL da Evolution, domínio e remetente de e-mail, modelo de LLM);
- segredo criptografado (só quando `own`);
- status: `not_configured` | `pending_test` | `active` | `failing` | `disabled`, com data/resultado do último teste;
- quem configurou e quando (auditoria).

Credenciais da plataforma: um registro por provedor (ex.: OpenAI da IntelliX, Resend da IntelliX, Google Places da IntelliX), mesmo esquema de criptografia, editáveis só pelo admin da plataforma.

**Regra de resolução** (`resolveConnection(orgId, category)`): devolve a conexão `active` da organização com a credencial efetiva (própria ou da plataforma). Sem conexão ativa → erro tipado `ConnectionNotConfigured` (nunca fallback). Quem chama decide: rotas respondem erro claro; jobs pulam o item e registram.

**Ativação por organização para categorias de plataforma:** a organização também nasce sem `llm`/`prospecting`/`email`; o admin ativa cada categoria (normalmente com origem `platform`). Assim "nasce sem nenhuma conexão" vale para tudo e o admin controla o que cada cliente usa.

### 4.3 E-mail com domínio do cliente

A conexão `email` guarda o domínio e o remetente da organização. Ativar exige: domínio cadastrado na conta Resend da IntelliX e verificado (checagem via API do Resend no teste de conexão). Sem domínio verificado → status `pending_test`/`failing` e envio bloqueado. O DNS é configurado pelo cliente com a equipe IntelliX; o sistema só mostra os registros a criar e o status.

### 4.4 Webhooks de entrada

- Um endpoint **por conexão de WhatsApp** (identificador opaco e não adivinhável da conexão na URL), substituindo `/api/webhooks/evolution/[token]` (token por usuário, Sprint 1).
- Verificação por provedor: Meta = `hub.verify_token` no GET de verificação + assinatura `X-Hub-Signature-256` (app secret) no POST; Evolution = token/apikey configurado na conexão.
- O payload é normalizado por adapter (formato Meta e formato Evolution) para um evento interno único antes de entrar no fluxo do agente/inbox; a organização vem da conexão, nunca do payload.
- Transição: o endpoint atual por token continua aceitando até a conexão equivalente ser criada e a URL trocada no provedor; depois é removido (critério de saída).

### 4.5 Telas

- **Admin da plataforma** (Configurações → Organizações → [org] → Integrações): por categoria, escolher provedor e origem, preencher configuração e segredo (campo só de escrita: depois de salvo mostra apenas "configurado em … por …" e os 4 últimos caracteres quando fizer sentido), botão **Testar conexão**, ativar/desativar, ver URL de webhook a cadastrar no provedor e registros DNS do e-mail. Também: Configurações → Credenciais da plataforma.
- **Cliente** (Integrações): somente leitura — por categoria, provedor, status e data do último teste; aviso "fale com a IntelliX" quando algo não estiver ativo. Nenhum campo de chave.
- Telas e ações onde falta conexão (envio, campanha, inbox, follow-up, prospecção) mostram aviso explícito em vez de falhar silenciosamente.

### 4.6 Registro de consumo (decisão do usuário, 2026-10-31: entra, versão mínima)

Registrar por organização cada uso de recurso pago, **no adaptador de cada conector** (ponto único, não em cada rota): tokens de LLM, buscas Google Places/Apify, páginas Firecrawl, e-mails enviados, mensagens de WhatsApp enviadas. Tabela append-only (organização, categoria, provedor, operação, quantidade, unidade, data), RLS de leitura por organização, escrita só pelo servidor. **Sem** limites, cobrança, telas ou relatórios agora; apenas uma consulta SQL documentada de consumo por organização/mês. Falha ao registrar consumo nunca bloqueia a operação (loga e segue).

## 5. Restrições

- **Segurança/LGPD:** segredos criptografados com AES-256-GCM na aplicação (Web Crypto, compatível com Node e Cloudflare Workers), chave mestra em variável de ambiente do servidor com identificador de versão para rotação; banco nunca vê texto puro; tabelas com RLS por organização; leitura do segredo só pelo servidor (service role) dentro de `resolveConnection`; nenhuma rota devolve segredo; logs mascarados. Escrita de conexões e credenciais da plataforma só por admin da plataforma (checado no servidor **e** no banco). *(Escolha do executor: AES-GCM na aplicação em vez de Supabase Vault — funciona igual nos dois runtimes e não depende de SQL com segredo em claro.)*
- **Multi-tenant:** a organização é sempre derivada do registro de domínio (lead, campanha, conversa, conexão do webhook), nunca do corpo da requisição; testes provando que org A não usa conexão nem lê status de org B.
- **Banco:** migrations versionadas com rollback no mesmo PR e backup prévio (regra de produção do `CLAUDE.md`); PK UUID, `created_at`/`updated_at`; schema inspecionado ao vivo antes (as migrations locais estão incompletas).
- **Código:** camadas componentes → services → repositories → Supabase; Zod em toda entrada; respostas `{ data, meta }` / `{ error: { code, message } }`; TypeScript sem `any` no código novo.
- **Runtime:** nada de `node:crypto`/`Buffer` no código novo (Sprint 3 vai para Workers).
- **Edge function `prospection`** (Supabase) lê Google/Lovable/Evolution do ambiente e de `user_settings`. *(Decisão do executor, firme: trazer a prospecção para um route handler do app que usa `resolveConnection` para `prospecting` e `llm`, e aposentar a edge function `prospection` e o gateway Lovable AI — um provedor escondido com chave própria contraria o objetivo deste sprint. Fica como a última fatia (PR próprio), depois de WhatsApp e e-mail.)*

## 6. Migração dos dados atuais

**Estado em produção (consultado em 2026-10-31):** 3 organizações, 3 membros, 4 linhas em `user_settings` (3 sem `organization_id`), 2 com algum segredo preenchido; os 111 leads pertencem a uma única organização (`tenant_id = 'intellix'`). Ou seja, há **um** tenant operando (a própria IntelliX).

**Chave de tenant:** `organization_id` (UUID) é a chave de tudo que é novo (conexões, credenciais, consumo, RLS). `tenant_id` (texto) é legado: o código novo não o usa, e os desvios por `tenant_id === 'intellix'` no código de IA/follow-up passam a usar a conexão/configuração da organização (remover o desvio faz parte deste sprint; remover a coluna fica para a reconciliação do Sprint 2). Jobs, cron e webhooks resolvem a organização pelo registro (lead/campanha/conversa/conexão), não pelo usuário.

**Migração assistida, não automática:** um script de migração (idempotente, com `--dry-run`) cria as conexões da organização a partir de `user_settings` do usuário admin daquela organização; usuários sem organização não são migrados. O admin da plataforma revisa o resultado na tela e roda o teste de conexão. Cada passo em produção (migration, script, troca da URL do webhook no provedor, remoção de colunas) segue a regra do `CLAUDE.md`: autorização explícita do usuário naquele momento, backup prévio e rollback no PR.

- Para a organização que opera hoje: criar a conexão `whatsapp` (Evolution ou Meta, conforme a configuração vigente) a partir de `user_settings`, criptografando o segredo; criar as categorias de plataforma ativas com origem `platform`.
- Chaves próprias hoje em `user_settings` (`openai_api_key`, `resend_api_key`, `apify_api_key`, `firecrawl_api_key`) viram conexões `own` só se estiverem preenchidas; caso contrário, origem `platform`.
- Depois que todo o código ler das conexões: remover as colunas de segredo em texto puro de `user_settings` (inclusive `evolution_instance_name`, `zapi_*`, `business_access_token`, `meta_verify_token`) e a variável `WHATSAPP_PROVIDER`. Backup antes, rollback no PR.

## 7. Critério de saída

1. `git grep` documentado: nenhuma leitura de credencial de provedor via `process.env` em código que age em nome de organização (só a chave mestra de criptografia e credenciais de infraestrutura como Supabase).
2. Duas organizações de teste, uma com Meta e outra com Evolution, enviando e recebendo WhatsApp isoladamente; organização sem conexão não envia e mostra o aviso.
3. E-mail enviado com o domínio verificado da organização; organização sem domínio verificado bloqueada.
4. Teste de RLS: cliente não lê segredo nem conexão de outra org; cliente não escreve conexão; admin da plataforma escreve.
5. Colunas de segredo em texto puro removidas de `user_settings`; endpoint de webhook por token de usuário removido.

## 8. Deixado para o executor

- **Admin da plataforma** lê e escreve conexões de qualquer organização pelo servidor (service role), depois de `isPlatformAdmin` no servidor; a tela escolhe a organização alvo. RLS também permite a escrita só a `is_platform_admin()`.
- **Rotação da chave mestra:** cada segredo guarda o id da versão da chave; rotacionar = nova chave no ambiente + script que recriptografa; a chave antiga sai depois.

- Nomes de tabelas, colunas, rotas e componentes; forma exata da interface de cada porta (`WhatsAppPort`, `EmailPort`, `LlmPort`, `ProspectingPort`) a partir de `IWhatsAppProvider` existente.
- Formato do identificador opaco do webhook por conexão.
- Como o teste de conexão é feito por provedor (chamada mínima e barata de cada API).
- Ordem das tarefas e fatiamento em PRs, desde que cada PR mantenha o sistema funcionando para o tenant atual.
