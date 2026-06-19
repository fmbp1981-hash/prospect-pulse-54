/**
 * Templates de WhatsApp de prospecção — Campanha IntelliX.AI
 * Encontro & Relacionamento | Felipe Melo
 *
 * Variáveis: {{1}} = primeiro nome, {{2}} = empresa
 * (padrão Meta — no disparo manual use {{nome}} e {{empresa}})
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
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro & Relacionamento do Dirceu Cordeiro — foi muito bom conhecer o trabalho da {{empresa}}. Queria te mandar um resumo de 2 minutos sobre como ajudamos empresas do Nordeste a automatizar tarefas repetitivas com IA, sem complicar a operação. Posso te enviar? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_construcao_v1',
    name: 'Construção & Imobiliário',
    segment: 'Construção, Incorporação, Imobiliário',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro & Relacionamento do Dirceu Cordeiro — foi bom conhecer a {{empresa}}. Trabalho com empresas de construção e imobiliário que perdem tempo qualificando leads sem perfil e fazendo follow-up manual em negociação longa. Posso te mostrar como resolver em 2 minutos? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_juridico_v1',
    name: 'Jurídico & Advocacia',
    segment: 'Jurídico, Advocacia, Direito',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{empresa}}. Muitos escritórios perdem tempo com triagem de casos fora do perfil e atendimento inicial que não converte. Tenho uma solução específica para isso. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_saude_v1',
    name: 'Saúde & Clínicas',
    segment: 'Saúde, Clínica, Odontologia, Laboratório',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi ótimo conhecer a {{empresa}}. Clínicas e laboratórios costumam ter duas dores: confirmar consultas manualmente e perder pacientes que não retornam. A gente resolve as duas com IA, sem trocar de sistema. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_atacado_v1',
    name: 'Atacado & Distribuição',
    segment: 'Atacado, Distribuição, Food Service',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — curti conhecer a {{empresa}}. Distribuidoras e atacadistas perdem tempo respondendo pedidos no WhatsApp e cobrando manualmente. A gente automatiza isso e libera o time. Posso te mostrar como funciona? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_tech_v1',
    name: 'Tecnologia & TI',
    segment: 'Tecnologia, TI, Telecom, Suporte',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — foi bom trocar ideia com a {{empresa}}. Empresas de TI têm dois desafios: prospecção ativa escassa e suporte que consome o time técnico. Tenho soluções para os dois — e uma conversa sobre parceria que pode fazer sentido. Posso mandar mais detalhes? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_agencia_v1',
    name: 'Agências de Marketing',
    segment: 'Marketing, Agência, Publicidade, Tráfego',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{empresa}}. Agências perdem tempo gerando relatório manual e fazendo onboarding de novos contratos. A gente automatiza isso com IA e o time foca em estratégia. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_financeiro_v1',
    name: 'Consultoria & Financeiro',
    segment: 'Consultoria, Financeiro, Seguros, Consórcio',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se cruzou no Encontro do Dirceu Cordeiro — foi bom conhecer a {{empresa}}. Empresas de consultoria e seguros recebem muitos leads mas qualificam poucos, e perdem venda por falta de follow-up. A gente resolve isso com automação inteligente. Posso te mostrar como? Se preferir não receber, responda "sair".',
  },
  {
    id: 'intellix_er_energiasolar_v1',
    name: 'Energia Solar',
    segment: 'Energia Solar',
    body: 'Oi, {{nome}}! Aqui é o Felipe, da IntelliX.AI. A gente se encontrou no Encontro do Dirceu Cordeiro — curti conhecer a {{empresa}}. Empresas de energia solar recebem muitos leads mas convertem pouco, por falta de qualificação rápida e follow-up pós-visita. A gente automatiza esse funil. Posso te mandar um resumo? Se preferir não receber, responda "sair".',
  },
];
