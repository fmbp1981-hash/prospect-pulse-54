# PRD — LeadFinder Pro (versão mínima, 2026-11-04)

Documento mínimo criado na migração para o framework IntelliX 3.1. Expandir quando
houver nova fase de produto; não substitui o `SPEC.md` de cada feature.

## Problema
Pequenas e médias empresas brasileiras precisam encontrar empresas e pessoas para
vender (prospecção B2B), organizar esses contatos e conduzir a conversa até a venda,
sem montar várias ferramentas e sem violar a LGPD.

## Usuários
- **Organização cliente**: empresa que usa o sistema; membros com papéis `admin`,
  `operador` e `visualizador`.
- **Admin da plataforma (IntelliX.AI)**: configura credenciais da plataforma e
  conexões de cada organização.
- **Titular**: pessoa física contatada (lead); não usa o sistema, mas tem direitos
  pela LGPD (ex.: oposição).

## Capacidades atuais
- Prospecção por Google Places e LinkedIn (Apify), com enriquecimento (Firecrawl).
- Importação de planilhas; tabela de leads, Kanban do funil, dashboard.
- Inbox de WhatsApp com agente de IA e atendimento humano (WhatsApp desligado até a
  Fase 4 do plano pós-virada).
- Campanhas e e-mail em massa (Resend); follow-ups automáticos por fila.
- Conexões por organização (WhatsApp, e-mail, LLM, prospecção), com credencial
  própria ou da plataforma.

## Restrições
- Multi-tenant por organização, com isolamento no banco (RLS) e no servidor.
- Dados pessoais de brasileiros: LGPD desde o desenho (minimização, oposição, logs
  sem dado pessoal).
- Custo de provedores pagos controlado por organização.

## Prioridades vigentes
`docs/superpowers/plans/2026-11-04-pos-virada.md` (Sprint 4: opt-out, cota,
supressão, restore; depois dependências, WhatsApp e staging separado).

## Métricas
Leads prospectados e convertidos por estágio do funil (dashboard); consumo por
organização (`usage_events`); envios bloqueados por oposição (após o opt-out).
