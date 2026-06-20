/**
 * Templates de email de prospecção — Campanha IntelliX.AI
 * Encontro & Relacionamento | Felipe Maranhão
 *
 * Variáveis suportadas:
 *   {{empresa}}   — nome da empresa prospectada
 *   {{nome}}      — nome do contato (fallback: empresa)
 *   {{cidade}}    — cidade do lead
 *   {{categoria}} — segmento do lead
 *   {{logo_url}}  — URL absoluta do logo (injetada pelo servidor)
 */

function htmlWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IntelliX.AI</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:20px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="{{logo_url}}" alt="IntelliX.AI" width="130" height="auto"
                         style="display:block;max-width:130px;height:auto;" />
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="color:#94a3b8;font-size:12px;">Automação Inteligente</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              ${content}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" />
            </td>
          </tr>

          <!-- Footer / Assinatura -->
          <tr>
            <td style="padding:20px 32px 28px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:14px;">
                    <img src="{{logo_url}}" alt="IntelliX.AI" width="56" height="auto"
                         style="display:block;max-width:56px;height:auto;border-radius:6px;" />
                  </td>
                  <td style="vertical-align:middle;border-left:2px solid #e2e8f0;padding-left:14px;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:#1e293b;">Felipe Maranhão</p>
                    <p style="margin:2px 0 0;font-size:12px;color:#64748b;">Fundador · IntelliX.AI</p>
                    <p style="margin:2px 0 0;font-size:12px;color:#64748b;">
                      <a href="mailto:contato@intellixai.com.br" style="color:#6366f1;text-decoration:none;">contato@intellixai.com.br</a>
                      &nbsp;·&nbsp;Recife, PE
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;line-height:1.6;">
                Para não receber mais emails desta empresa,
                <a href="mailto:contato@intellixai.com.br?subject=Descadastrar" style="color:#6366f1;">clique aqui para descadastrar</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function bodyStyle(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#1e293b;line-height:1.7;">${text}</p>`;
}

function ctaButton(label: string): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:#6366f1;border-radius:6px;">
        <a href="mailto:contato@intellixai.com.br?subject=Quero+saber+mais" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function highlightBox(text: string): string {
  return `<div style="background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;padding:14px 18px;margin:20px 0;font-size:14px;color:#334155;line-height:1.6;">${text}</div>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string;
  name: string;
  segment: string;
  subject: string;
  body: string;
}

export const INTELLIX_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'intellix_email_universal_v1',
    name: 'Universal (fallback)',
    segment: 'Todos os segmentos',
    subject: 'Automação com IA para {{empresa}} — 2 minutos do seu tempo?',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Meu nome é <strong>Felipe Maranhão</strong>, fundador da <strong>IntelliX.AI</strong>. Chegamos até a <strong>{{empresa}}</strong> porque ajudamos empresas do Nordeste a automatizar tarefas repetitivas com Inteligência Artificial — sem precisar contratar mais pessoas ou trocar os sistemas atuais.')}
      ${highlightBox('Nossos clientes economizam em média <strong>15h/semana</strong> de trabalho manual nos primeiros 30 dias — em atendimento, qualificação de leads e follow-ups.')}
      ${bodyStyle('Tenho um material rápido que explica como funciona na prática. Posso enviar?')}
      ${ctaButton('Quero saber mais')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_construcao_v1',
    name: 'Construção & Imobiliário',
    segment: 'Construção, Incorporação, Imobiliário',
    subject: 'Qualificação de leads e follow-up automático para a {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Trabalho com construtoras, incorporadoras e imobiliárias que enfrentam dois desafios muito comuns:')}
      ${highlightBox(`
        <strong>1. Leads sem perfil</strong> — equipe de vendas gasta tempo com quem não vai comprar<br/>
        <strong>2. Follow-up manual</strong> — negociações longas geram esquecimentos e perda de venda
      `)}
      ${bodyStyle('Automatizamos esses dois processos com IA, direto no WhatsApp ou email, sem precisar trocar de CRM.')}
      ${bodyStyle('Posso te mostrar como funciona em menos de 10 minutos. Faz sentido uma conversa rápida esta semana?')}
      ${ctaButton('Sim, quero ver como funciona')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_juridico_v1',
    name: 'Jurídico & Advocacia',
    segment: 'Jurídico, Advocacia, Direito',
    subject: 'Triagem de casos e atendimento inicial automático — para a {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Identificamos que escritórios de advocacia e consultorias jurídicas como a <strong>{{empresa}}</strong> frequentemente perdem tempo com:')}
      ${highlightBox(`
        → Triagem de potenciais clientes com casos fora do perfil do escritório<br/>
        → Atendimento inicial que não converte e ocupa advogados seniores<br/>
        → Acompanhamento de processos e prazos feito manualmente
      `)}
      ${bodyStyle('Desenvolvemos um agente de IA que faz essa triagem automaticamente, qualifica o caso antes do primeiro contato humano e envia lembretes de prazo — tudo com linguagem jurídica adequada.')}
      ${bodyStyle('Posso enviar um caso de uso de 2 minutos mostrando como funciona na prática?')}
      ${ctaButton('Quero ver o caso de uso')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_saude_v1',
    name: 'Saúde & Clínicas',
    segment: 'Saúde, Clínica, Odontologia, Laboratório',
    subject: 'Confirmação de consultas e reativação de pacientes — {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Clínicas e laboratórios como a <strong>{{empresa}}</strong> costumam ter duas dores que impactam diretamente o faturamento:')}
      ${highlightBox(`
        <strong>Faltas e cancelamentos</strong> — confirmação manual não escala e a agenda fica com horários vazios<br/><br/>
        <strong>Pacientes que somem</strong> — após o primeiro atendimento, não há follow-up para trazer de volta
      `)}
      ${bodyStyle('A IntelliX.AI resolve as duas situações com automação via WhatsApp: o agente confirma consultas automaticamente, remarca cancelamentos em tempo real e dispara reativação para pacientes inativos — sem precisar trocar de sistema de gestão.')}
      ${bodyStyle('Posso te enviar um resumo rápido de como implementamos em clínicas da região?')}
      ${ctaButton('Quero ver o resumo')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_atacado_v1',
    name: 'Atacado & Distribuição',
    segment: 'Atacado, Distribuição, Food Service',
    subject: 'Pedidos e cobranças automáticos no WhatsApp — para {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Distribuidoras e atacadistas como a <strong>{{empresa}}</strong> normalmente têm representantes passando horas por dia respondendo pedidos no WhatsApp e ligando para cobrar pagamentos em atraso.')}
      ${highlightBox(`
        Automatizamos <strong>recebimento de pedidos</strong>, <strong>emissão de orçamento</strong> e <strong>cobrança de inadimplentes</strong> diretamente no WhatsApp —
        o time comercial para de ser operacional e foca em novos clientes.
      `)}
      ${bodyStyle('Já implementamos isso para distribuidoras no Nordeste com resultados visíveis na primeira semana. Posso te mostrar como funciona?')}
      ${ctaButton('Sim, quero ver como funciona')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_tech_v1',
    name: 'Tecnologia & TI',
    segment: 'Tecnologia, TI, Telecom, Suporte',
    subject: 'Prospecção ativa e suporte automatizados — {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Empresas de TI e tecnologia como a <strong>{{empresa}}</strong> enfrentam dois gargalos que consomem o time técnico:')}
      ${highlightBox(`
        <strong>Prospecção escassa</strong> — o time é bom em entregar, mas não tem estrutura para prospectar ativamente<br/><br/>
        <strong>Suporte de nível 1</strong> — tickets simples ocupam desenvolvedores que deveriam estar produzindo
      `)}
      ${bodyStyle('Com a IntelliX.AI, o agente de IA cuida do primeiro contato com leads, qualifica oportunidades e resolve tickets básicos no WhatsApp ou email — sem precisar de um time de SDR ou suporte dedicado.')}
      ${bodyStyle('Existe também uma conversa interessante sobre <strong>parceria comercial</strong> — atendemos segmentos que se complementam com TI. Posso detalhar?')}
      ${ctaButton('Quero saber mais')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_agencia_v1',
    name: 'Agências de Marketing',
    segment: 'Marketing, Agência, Publicidade, Tráfego',
    subject: 'Relatórios automáticos e onboarding de clientes — {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Agências como a <strong>{{empresa}}</strong> costumam perder horas toda semana em duas tarefas operacionais que poderiam ser automatizadas:')}
      ${highlightBox(`
        → <strong>Relatórios de performance</strong> feitos manualmente no Google Sheets ou PowerPoint<br/>
        → <strong>Onboarding de novos contratos</strong> — coleta de acessos, briefing e configurações iniciais
      `)}
      ${bodyStyle('A IntelliX.AI automatiza esses dois processos: gera relatórios consolidados automaticamente e conduz o onboarding do cliente via fluxo conversacional no WhatsApp — o time da agência foca em estratégia, não em tarefas operacionais.')}
      ${bodyStyle('Posso te enviar um exemplo de relatório gerado automaticamente para uma agência parceira?')}
      ${ctaButton('Quero ver o exemplo')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_financeiro_v1',
    name: 'Consultoria & Financeiro',
    segment: 'Consultoria, Financeiro, Seguros, Consórcio',
    subject: 'Qualificação de leads e follow-up de propostas — {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Empresas de consultoria, seguros e consórcio como a <strong>{{empresa}}</strong> recebem muitos leads mas convertem pouco — e o principal motivo é <strong>falta de qualificação rápida e follow-up consistente</strong>.')}
      ${highlightBox(`
        Um lead que pede cotação às 22h e não é respondido até o dia seguinte já pesquisou o concorrente.
        Um cliente que não recebe follow-up após a proposta simplesmente esquece.
      `)}
      ${bodyStyle('A IntelliX.AI automatiza a qualificação inicial (via WhatsApp ou email) e dispara follow-ups em sequência para cada etapa do funil — sem depender do vendedor se lembrar.')}
      ${bodyStyle('Faz sentido conversar? Posso mostrar como isso funciona em 10 minutos.')}
      ${ctaButton('Sim, quero uma demonstração')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },

  {
    id: 'intellix_email_energiasolar_v1',
    name: 'Energia Solar',
    segment: 'Energia Solar',
    subject: 'Qualificação de leads e follow-up pós-visita — {{empresa}}',
    body: htmlWrapper(`
      ${bodyStyle('Olá, <strong>{{nome}}</strong>!')}
      ${bodyStyle('Sou <strong>Felipe Maranhão</strong>, da <strong>IntelliX.AI</strong>. Empresas de energia solar como a <strong>{{empresa}}</strong> costumam ter um funil com dois buracos grandes:')}
      ${highlightBox(`
        <strong>1. Muitos leads, pouca qualificação</strong> — a equipe técnica vai até locais sem real potencial de fechamento<br/><br/>
        <strong>2. Follow-up pós-visita fraco</strong> — o cliente pediu orçamento, ficou "pensando" e o vendedor não voltou no tempo certo
      `)}
      ${bodyStyle('A IntelliX.AI resolve os dois: um agente de IA qualifica o lead antes da visita (conta de luz, tipo de imóvel, perfil de consumo) e dispara follow-ups automáticos depois — aumentando a taxa de fechamento sem adicionar vendedores.')}
      ${bodyStyle('Posso te enviar um resumo de como implantamos isso em empresas de solar na região?')}
      ${ctaButton('Quero ver o resumo')}
      ${bodyStyle('Att,<br/><strong>Felipe Maranhão</strong><br/>Fundador · IntelliX.AI')}
    `),
  },
];

export function getTemplateById(id: string): EmailTemplate | undefined {
  return INTELLIX_EMAIL_TEMPLATES.find(t => t.id === id);
}

export function applyTemplateVariables(
  text: string,
  vars: { empresa?: string; nome?: string; cidade?: string; categoria?: string; logo_url?: string }
): string {
  const appUrl = vars.logo_url || process.env.NEXT_PUBLIC_APP_URL || '';
  const logoUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/intellix-logo.png` : '';
  return text
    .replace(/\{\{empresa\}\}/g, vars.empresa || 'sua empresa')
    .replace(/\{\{nome\}\}/g, vars.nome || vars.empresa || 'você')
    .replace(/\{\{cidade\}\}/g, vars.cidade || 'sua cidade')
    .replace(/\{\{categoria\}\}/g, vars.categoria || 'seu segmento')
    .replace(/\{\{logo_url\}\}/g, logoUrl);
}
