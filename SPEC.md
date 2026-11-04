# Opt-out de contatos — LeadFinder Pro

## Overview
O titular de um lead pode se opor a novos contatos, e a organização passa a
respeitar isso em todos os canais. A oposição pode ser registrada pelo próprio
titular (link no e-mail ou pedido no WhatsApp), pelo agente de IA ou por um
usuário da organização. Enquanto vigente, nenhum envio automático ou manual
chega a essa pessoa, e ela não volta a entrar como lead novo por prospecção ou
importação. Cada registro guarda quando, por qual canal e por quem a oposição
foi feita, para servir de prova de atendimento ao direito de oposição.

Origem: item 1.1 de `docs/superpowers/plans/2026-11-04-pos-virada.md` e LGPD-02
ampliado em `docs/security/security-gate-2026-11-03-b6.md`. Prazo: 2026-11-17.
Pré-requisito para religar o WhatsApp e para enviar campanha ou e-mail em massa.

Fora do escopo: rate limit e cota (item 1.2); supressão específica do Google
Places por `place_id` (item 1.3, que vai consumir a lista daqui).

## Conceitos
- **Oposição**: registro, por organização, de que uma pessoa não quer mais ser
  contatada. Identificada pelo telefone normalizado e/ou pelo e-mail
  normalizado; fica ligada ao lead quando ele existe, mas **sobrevive à
  exclusão do lead**.
- **Origem da oposição**: `link_email`, `whatsapp_titular`, `agente_ia`,
  `usuario`, `importacao`.
- **Envio bloqueado**: tentativa de envio a uma pessoa com oposição vigente; não
  sai nada e o motivo fica visível para quem tentou enviar.

## [/leads]
Tabela de leads, detalhe e edição do lead.

### Components
- **OptOutBadge**: indica, na linha da tabela, no card do Kanban e no detalhe do
  lead, que a pessoa se opôs a contatos.
- **OptOutPanel**: no detalhe do lead, mostra situação, data, origem e autor da
  oposição, com as ações permitidas ao papel do usuário.
- **OptOutConfirmDialog**: confirma o registro ou a revogação, exigindo motivo
  na revogação.
- **OptOutFilter**: filtro da tabela por "com oposição" / "sem oposição".

### Behaviors
- **register-opt-out-by-user**: admin ou operador marca a oposição de um lead,
  com motivo opcional; a origem fica `usuario` e o autor é o usuário logado.
- **revoke-opt-out-with-evidence**: só admin da organização revoga, informando
  o motivo (ex.: novo consentimento do titular); a revogação fica registrada,
  sem apagar o histórico.
- **show-opt-out-status**: tabela, Kanban e detalhe mostram o selo e o painel;
  visualizador vê o status mas não altera.
- **filter-leads-by-opt-out**: a tabela filtra por situação de oposição.
- **exclude-opted-out-from-bulk-selection**: ações em massa (WhatsApp, e-mail,
  exportação para campanha) avisam quantos selecionados têm oposição e os
  deixam de fora.

## [/campanhas]
Criação e disparo de campanhas.

### Components
- **AudienceOptOutSummary**: antes do disparo, mostra quantos destinatários do
  público foram excluídos por oposição.

### Behaviors
- **exclude-opted-out-from-campaign-audience**: o público de uma campanha
  nunca inclui pessoas com oposição, inclusive se a oposição surgir entre a
  criação e o disparo.
- **report-blocked-recipients**: o resultado do disparo informa quantos foram
  pulados por oposição, separado de falhas de envio.

## [/inbox]
Conversas de WhatsApp.

### Components
- **ConversationOptOutBanner**: na conversa de uma pessoa com oposição, avisa
  que novos envios estão bloqueados.

### Behaviors
- **block-manual-reply-to-opted-out**: o atendente não consegue enviar
  mensagem a quem tem oposição; o envio é recusado com o motivo.
- **allow-final-confirmation-message**: exceção única — a mensagem que confirma
  ao titular que a remoção foi feita, enviada no mesmo atendimento em que ele
  pediu para sair.

## [/descadastro]
Página pública (sem login) aberta pelo link de descadastro do e-mail.

### Components
- **UnsubscribeConfirmation**: confirma ao titular que ele não receberá mais
  contatos daquela organização, sem expor dados do lead.
- **UnsubscribeInvalidLink**: mensagem neutra para link inválido ou expirado.

### Behaviors
- **register-opt-out-from-email-link**: abrir o link registra a oposição com
  origem `link_email`; repetir o acesso não duplica o registro.
- **unsubscribe-link-is-unforgeable**: o link identifica a pessoa e a
  organização sem permitir descobrir ou alterar dados de outra pessoa.
- **every-outbound-email-has-unsubscribe-link**: todo e-mail de campanha ou em
  massa sai com o link de descadastro no lugar do atual `mailto`.

## Fluxos sem tela

### Behaviors
- **agent-registers-opt-out-on-request**: quando o titular pede para sair numa
  conversa, o agente de IA registra a oposição (origem `agente_ia`), confirma a
  remoção e encerra; o agente nunca promete remoção sem registrá-la.
- **detect-explicit-stop-keywords**: mensagens inequívocas de saída ("sair",
  "parar", "não quero mais receber") registram a oposição mesmo se o agente
  estiver desligado ou em atendimento humano (critério na decisão 3); o
  atendente vê na conversa que a oposição foi registrada automaticamente.
- **block-follow-up-for-opted-out**: os follow-ups (curto e longo) não enviam e
  cancelam os agendamentos pendentes de quem tem oposição.
- **block-single-whatsapp-send**: o disparo avulso de WhatsApp recusa pessoas
  com oposição.
- **block-bulk-email-send**: o envio de e-mail em massa pula pessoas com
  oposição e conta quantas foram puladas.
- **block-reentry-by-prospecting-and-import**: prospecção (Google e LinkedIn) e
  importação de planilha não recriam lead para pessoa com oposição na mesma
  organização; o resumo informa quantos foram suprimidos.
- **opt-out-is-scoped-to-organization**: a oposição feita para uma organização
  não afeta outra.
- **opt-out-audit-trail**: cada registro e revogação guarda data, origem, autor
  (usuário, agente ou titular) e motivo; o histórico não pode ser editado nem
  apagado por usuários da organização.
- **opt-out-without-personal-data-in-logs**: logs e métricas de bloqueio
  registram só identificadores, nunca telefone, e-mail ou conteúdo de mensagem.

## Decisões (2026-11-04)
1. **Escopo**: a oposição vale para **todos os canais** (WhatsApp, e-mail e
   qualquer canal futuro). Não há oposição por canal.
2. **Revogação**: só **admin da organização**, com **motivo obrigatório**
   (ex.: novo consentimento do titular, registro feito por engano). A revogação
   é um novo evento no histórico; a oposição anterior não é apagada. Operador e
   visualizador não revogam.
3. **Palavras de saída**: registram a oposição **mesmo com o agente de IA
   desligado** ou em atendimento humano. Só contam mensagens cujo conteúdo
   inteiro é um pedido de saída inequívoco (ex.: "sair", "parar", "pare", "não
   quero mais receber", "remover meu contato"), sem distinguir maiúsculas,
   acentos e pontuação; frases em que a palavra aparece em outro sentido não
   contam. Cada registro automático guarda a mensagem como evidência por
   referência (id), não o texto em log.
4. **Leads existentes**: todos começam **sem oposição**; não há lista externa a
   importar. Observação: há 111 leads reais em produção (IntelliX.AI, origem
   `evento_encontro_relacionamento`, até 2026-06); decidir à parte se ficam ou
   saem — fora do escopo deste SPEC.
