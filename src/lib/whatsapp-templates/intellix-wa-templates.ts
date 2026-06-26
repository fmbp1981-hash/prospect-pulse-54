/**
 * Templates de WhatsApp de prospecção — Campanha IntelliX.AI
 * Encontro & Relacionamento | Felipe Maranhão
 *
 * Variáveis: {{nome}} = primeiro nome do contato, {{empresa}} = nome da empresa
 * Cada template: contexto do evento → dor do segmento → exemplo concreto de IA.
 */

export interface WaTemplate {
  id: string;
  name: string;
  segment: string;
  body: string;
}

export const INTELLIX_WA_TEMPLATES: WaTemplate[] = [
  {
    id: 'intellix_er_universal_v1',
    name: 'Universal (fallback)',
    segment: 'Todos os segmentos',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer o trabalho da {{empresa}}.

Depois do evento fiquei pensando e queria compartilhar algo que pode fazer sentido pra vocês: trabalhamos com empresas do Nordeste que perdem horas por semana em tarefas repetitivas que a IA já resolve — atendimento inicial, qualificação de leads, follow-up e cobranças automáticas no WhatsApp.

Um exemplo rápido: um cliente nosso reduziu de 4h para 20min/dia o tempo gasto respondendo mensagens repetitivas, só com um agente de IA integrado ao WhatsApp.

Posso te mandar um resumo de 2 minutos mostrando como funcionaria para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_construcao_v1',
    name: 'Construção & Imobiliário',
    segment: 'Construção, Incorporação, Imobiliário',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer a {{empresa}}.

Depois do evento fiquei pensando em algo que pode fazer sentido pra vocês: trabalhamos com construtoras e imobiliárias que perdem tempo qualificando leads sem perfil e fazendo follow-up manual em negociações longas.

Um exemplo prático: implantamos um agente de IA para uma imobiliária que qualifica automaticamente cada lead (faixa de renda, bairro de interesse, prazo de compra) antes do primeiro contato humano. A equipe parou de gastar tempo com quem não tinha perfil — e a taxa de conversão subiu.

Posso te mostrar como funcionaria para a {{empresa}} em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_juridico_v1',
    name: 'Jurídico & Advocacia',
    segment: 'Jurídico, Advocacia, Direito',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — curti muito conhecer a {{empresa}}.

Depois do evento surgiu uma ideia que pode fazer sentido: escritórios costumam receber dezenas de contatos por semana, mas boa parte é de casos fora do perfil de atuação — e isso consome tempo de advogados seniores.

Um exemplo do que fazemos: um agente de IA que faz triagem inicial via WhatsApp, identifica a área do direito, avalia a viabilidade do caso e só encaminha para o advogado quando há fit real. Um escritório parceiro reduziu em 60% o tempo gasto com atendimento inicial.

Posso te mandar um resumo de como funcionaria para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_saude_v1',
    name: 'Saúde & Clínicas',
    segment: 'Saúde, Clínica, Odontologia, Laboratório',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi ótimo conhecer a {{empresa}}.

Depois do evento fiquei pensando em algo que pode fazer sentido pra vocês: clínicas costumam ter dois problemas que impactam direto no faturamento — confirmação manual de consultas e pacientes que somem após o primeiro atendimento.

Um exemplo prático: implantamos um agente de IA para uma clínica odontológica que confirma consultas via WhatsApp, remarca cancelamentos em tempo real e reativa pacientes inativos há 90 dias. Resultado: 35% menos faltas no primeiro mês, sem trocar de sistema.

Posso te enviar o caso completo em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_atacado_v1',
    name: 'Atacado & Distribuição',
    segment: 'Atacado, Distribuição, Food Service',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — curti muito conhecer a {{empresa}}.

Depois do evento surgiu uma ideia que pode fazer sentido: distribuidoras costumam ter representantes gastando horas por dia só respondendo pedidos no WhatsApp e cobrando inadimplentes manualmente.

Um exemplo do que resolvemos: um agente de IA que recebe o pedido via WhatsApp, consulta estoque em tempo real, gera orçamento automático e envia boleto — sem intervenção humana. Um cliente nosso liberou 3h/dia do time comercial só com isso.

Posso te mostrar como funcionaria para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_tech_v1',
    name: 'Tecnologia & TI',
    segment: 'Tecnologia, TI, Telecom, Suporte',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom trocar ideia com a {{empresa}}.

Depois do evento fiquei pensando em algo que pode fazer sentido — e que também abre espaço pra uma conversa de parceria: empresas de TI costumam ter o time técnico preso em tickets simples de suporte e pouca estrutura para prospecção ativa.

Um exemplo concreto: implantamos um agente de IA para uma empresa de TI que resolve 70% dos tickets de nível 1 automaticamente via WhatsApp (reset de senha, status de sistema, dúvidas de uso) — sem acionar o time técnico.

Tem espaço para uma conversa rápida sobre isso? Posso mandar mais detalhes.

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_agencia_v1',
    name: 'Agências de Marketing',
    segment: 'Marketing, Agência, Publicidade, Tráfego',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — curti muito conhecer a {{empresa}}.

Depois do evento pensei em algo que pode fazer sentido pra vocês: agências costumam perder horas toda semana em tarefas operacionais — relatórios manuais e onboarding de novos clientes são os dois maiores vilões.

Um exemplo prático: desenvolvemos para uma agência um agente que consolida dados de tráfego, gera o relatório em PDF automaticamente e envia para o cliente todo domingo — sem ninguém tocar. No onboarding, outro agente coleta acessos e briefing via WhatsApp em vez de e-mails intermináveis.

Posso te enviar um exemplo real do relatório gerado?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_financeiro_v1',
    name: 'Consultoria & Financeiro',
    segment: 'Consultoria, Financeiro, Seguros, Consórcio',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer a {{empresa}}.

Depois do evento surgiu uma ideia que pode fazer sentido: empresas de consultoria e seguros recebem muitos leads mas convertem pouco — e o principal motivo é falta de resposta rápida e follow-up consistente.

Um exemplo real: um cliente de consórcio tinha leads chegando pelo Instagram às 22h e sendo respondidos só no dia seguinte. Implantamos um agente de IA que responde em segundos, qualifica o perfil (renda, interesse, prazo) e agenda o consultor — só para quem tem fit. A taxa de conversão dobrou no primeiro mês.

Posso te mostrar como funcionaria para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_energiasolar_v1',
    name: 'Energia Solar',
    segment: 'Energia Solar',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — curti muito conhecer a {{empresa}}.

Depois do evento fiquei pensando em algo que pode fazer sentido pra vocês: empresas de solar costumam mandar equipe técnica fazer visita em leads sem perfil real de fechamento, e perder clientes que pediram orçamento mas "sumiram" depois.

Um exemplo concreto: implantamos um agente de IA para uma empresa de solar que qualifica o lead antes da visita via WhatsApp — pergunta o valor da conta de luz, tipo de imóvel e se é proprietário. Só agenda visita para quem tem perfil. Depois, dispara follow-ups automáticos no tempo certo. Resultado: -40% de visitas improdutivas e +25% de fechamento.

Posso te enviar o caso completo em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
];
