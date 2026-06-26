/**
 * Templates de WhatsApp de prospecção — Campanha IntelliX.AI
 * Encontro & Relacionamento | Felipe Maranhão
 *
 * Variáveis: {{nome}} = primeiro nome do contato, {{empresa}} = nome da empresa
 * Cada template traz um exemplo concreto de solução de IA para o segmento.
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
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Trabalho com empresas do Nordeste que perdem horas por semana em tarefas que a IA já resolve — atendimento inicial, qualificação de leads, follow-up e cobranças automáticas no WhatsApp.

Um exemplo rápido: um cliente nosso reduziu de 4h para 20min/dia o tempo gasto respondendo mensagens repetitivas, só com um agente de IA integrado ao WhatsApp dele.

Posso te mandar um resumo de 2 minutos mostrando como funciona na prática para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_construcao_v1',
    name: 'Construção & Imobiliário',
    segment: 'Construção, Incorporação, Imobiliário',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Trabalho com construtoras e imobiliárias como a {{empresa}} que perdem tempo qualificando leads sem perfil e fazendo follow-up manual em negociações longas.

Exemplo concreto: implementamos um agente de IA para uma imobiliária que qualifica o lead automaticamente (faixa de renda, bairro de interesse, prazo de compra) antes do primeiro contato humano. A equipe de vendas parou de gastar tempo com quem não tinha perfil — e a taxa de conversão subiu.

Posso te mostrar como funciona em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_juridico_v1',
    name: 'Jurídico & Advocacia',
    segment: 'Jurídico, Advocacia, Direito',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Escritórios como a {{empresa}} costumam receber dezenas de contatos por semana, mas boa parte é de casos fora do perfil de atuação — e isso consome tempo de advogados seniores.

Exemplo do que fazemos: um agente de IA que faz a triagem inicial via WhatsApp, identifica a área do direito, avalia viabilidade do caso e só encaminha para o advogado quando há fit real. Um escritório nosso cliente reduziu em 60% o tempo gasto em atendimento inicial.

Posso te mandar um resumo de como funciona?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_saude_v1',
    name: 'Saúde & Clínicas',
    segment: 'Saúde, Clínica, Odontologia, Laboratório',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Clínicas como a {{empresa}} costumam ter dois problemas que impactam direto no faturamento: confirmação manual de consultas (e as faltas que vêm com isso) e pacientes que somem após o primeiro atendimento.

Exemplo prático: implantamos um agente de IA para uma clínica odontológica que confirma consultas automaticamente via WhatsApp, remarca cancelamentos em tempo real e dispara mensagens de reativação para pacientes inativos há 90 dias. Resultado: 35% menos faltas no primeiro mês.

Posso te enviar o caso completo em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_atacado_v1',
    name: 'Atacado & Distribuição',
    segment: 'Atacado, Distribuição, Food Service',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Distribuidoras como a {{empresa}} costumam ter representantes gastando horas por dia só respondendo pedidos no WhatsApp e ligando para cobrar pagamentos em atraso.

Exemplo do que resolvemos: um agente de IA que recebe o pedido via WhatsApp, consulta estoque em tempo real, gera orçamento automático e envia boleto — tudo sem intervenção humana. Além disso, dispara cobranças para inadimplentes no momento certo. Um cliente nosso liberou 3h/dia do time comercial só com isso.

Posso te mostrar como funciona para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_tech_v1',
    name: 'Tecnologia & TI',
    segment: 'Tecnologia, TI, Telecom, Suporte',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Empresas de TI como a {{empresa}} geralmente têm dois gargalos: o time técnico preso respondendo tickets simples de suporte e falta de estrutura para prospecção ativa.

Exemplo concreto: implantamos um agente de IA para uma empresa de TI que resolve 70% dos tickets de nível 1 automaticamente via WhatsApp (reset de senha, status de sistema, dúvidas de uso) — sem acionar o time técnico. Outro agente cuida da prospecção ativa, qualificando leads e agendando demos.

Tem espaço para uma conversa rápida sobre isso? Posso mandar mais detalhes.

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_agencia_v1',
    name: 'Agências de Marketing',
    segment: 'Marketing, Agência, Publicidade, Tráfego',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Agências como a {{empresa}} costumam perder horas toda semana em tarefas operacionais que poderiam ser automatizadas — relatórios manuais e onboarding de novos clientes são os dois maiores.

Exemplo prático: desenvolvemos para uma agência um agente que consolida dados de tráfego, gera o relatório em PDF automaticamente e envia para o cliente todo domingo — sem nenhuma intervenção da equipe. No onboarding, outro agente coleta acessos, briefing e aprovações via WhatsApp em vez de e-mails intermináveis.

Posso te enviar um exemplo real do relatório gerado?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_financeiro_v1',
    name: 'Consultoria & Financeiro',
    segment: 'Consultoria, Financeiro, Seguros, Consórcio',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Empresas de consultoria e seguros como a {{empresa}} recebem muitos leads mas convertem pouco — e o principal motivo é falta de resposta rápida e follow-up consistente.

Exemplo do que resolvemos: um cliente de consórcio tinha leads chegando pelo Instagram às 22h e sendo respondidos só no dia seguinte. Implantamos um agente de IA que responde em segundos, qualifica o perfil (renda, interesse, prazo) e agenda o consultor — só para quem tem fit real. A taxa de conversão dobrou no primeiro mês.

Posso te mostrar como funciona para a {{empresa}}?

Se preferir não receber, responda "sair".`,
  },
  {
    id: 'intellix_er_energiasolar_v1',
    name: 'Energia Solar',
    segment: 'Energia Solar',
    body: `Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI.

Empresas de energia solar como a {{empresa}} costumam ter dois problemas sérios: equipe técnica indo fazer visita em leads sem real potencial de fechamento, e clientes que pediram orçamento mas "sumiram" depois.

Exemplo concreto: implantamos um agente de IA para uma empresa de solar que qualifica o lead antes da visita via WhatsApp — pergunta o valor da conta de luz, tipo de imóvel e se é proprietário. Só agenda visita para quem tem perfil. Depois da visita, dispara follow-ups automáticos no tempo certo. A empresa reduziu visitas improdutivas em 40% e aumentou o fechamento em 25%.

Posso te enviar o caso completo em 2 minutos?

Se preferir não receber, responda "sair".`,
  },
];
