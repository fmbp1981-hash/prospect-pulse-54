/**
 * REGRAS DE FOLLOW-UP DE LONGO PRAZO — Boas práticas B2B de vendas
 *
 * Baseado em: HubSpot Sales Methodology, Predictable Revenue (Aaron Ross),
 * e práticas do mercado de pagamentos/fintech no Brasil.
 *
 * Cada cenário tem uma sequência de follow-ups com mensagens específicas.
 */

export type FollowUpScenario =
  | 'low_revenue'          // Faturamento < R$50k/mês
  | 'no_response_short'    // Parou de responder (curto prazo — coberto pelo job de curto prazo)
  | 'no_response_long'     // Sem resposta por >3 dias (longo prazo)
  | 'qualified_not_closed' // Qualificado mas não fechou
  | 'transferred_no_close' // Transferido mas consultor não fechou
  | 'seasonal_reactivation'// Reativação sazonal (todos os leads frios)

export interface FollowUpStep {
  stepNumber: number;
  daysAfterLastContact: number;
  message: string;
  updateStatus?: string;
  isFinal?: boolean;
}

export interface FollowUpSequence {
  scenario: FollowUpScenario;
  label: string;
  steps: FollowUpStep[];
}

/**
 * Regras de follow-up por cenário.
 * Todas as mensagens são humanizadas antes do envio.
 */
export const FOLLOW_UP_SEQUENCES: Record<FollowUpScenario, FollowUpSequence> = {

  // ── Faturamento abaixo do mínimo (<R$50k/mês) ────────────────────────────
  // Hipótese: em 3-6 meses a empresa pode ter crescido ou mudado de situação
  low_revenue: {
    scenario: 'low_revenue',
    label: 'Faturamento abaixo do mínimo',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 90, // 3 meses
        message: `Oi! Tudo bem por aí? 😊 Passando para saber como está indo o negócio. Às vezes as coisas mudam rápido, né? Se quiser conversar sobre como otimizar os pagamentos da sua empresa, pode contar comigo!`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 180, // 6 meses
        message: `Olá! Sei que faz um tempo desde nosso último contato. Muita coisa pode ter mudado na sua empresa em 6 meses. Se o faturamento cresceu e você quer explorar formas de economizar nas taxas de cartão, seria ótimo conversar. O que acha?`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 365, // 1 ano
        message: `Olá! É a última mensagem que envio, mas queria deixar a porta aberta: se em algum momento seu faturamento crescer acima de R$50k/mês, a XPAG pode gerar uma economia real pra você. Qualquer hora pode me chamar. Cuide-se! 👋`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  // ── Sem resposta de curto prazo (>3 dias, covered aqui) ─────────────────
  // Lead estava em conversa e parou de responder após o short-term follow-up
  no_response_short: {
    scenario: 'no_response_short',
    label: 'Sem resposta (curto prazo)',
    steps: [
      // Coberto pelo follow-up.job.ts (10min, 1h, 24h)
      // Este cenário só existe para compatibilidade
    ],
  },

  // ── Sem resposta longo prazo (lead abandonou após semana) ────────────────
  no_response_long: {
    scenario: 'no_response_long',
    label: 'Sem resposta (longo prazo)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 7, // 1 semana
        message: `Oi! Sei que o dia a dia corrido não deixa tempo pra muita coisa. Se ainda tiver interesse em otimizar os custos com pagamentos da sua empresa, é só me falar. Sem pressa! 😊`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 21, // 3 semanas
        message: `Olá! Passando para checar se teve alguma mudança por aí. Às vezes a gente deixa passar uma oportunidade por falta de tempo mesmo. Se quiser retomar a conversa, pode me chamar quando quiser.`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 45, // 45 dias
        message: `Oi! Última tentativa de contato da minha parte. Se em algum momento fizer sentido conversar sobre formas de reduzir taxas e organizar melhor os pagamentos, estarei por aqui. Boa sorte com o negócio! 🤝`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  // ── Qualificado mas não fechou ───────────────────────────────────────────
  // Lead tinha o perfil ideal mas não avançou para a transferência
  qualified_not_closed: {
    scenario: 'qualified_not_closed',
    label: 'Qualificado sem fechamento',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 14, // 2 semanas
        message: `Oi! Sei que ficou de pensar na proposta. Queria só saber se surgiu alguma dúvida que eu possa ajudar a esclarecer. A oportunidade de reduzir as taxas ainda está em aberto! 💪`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 30, // 1 mês
        message: `Olá! Um mês se passou. Às vezes é difícil encontrar o momento certo pra tomar uma decisão, eu entendo. Mas posso te dizer que vários empresários que estavam na mesma situação que você economizaram bastante depois de falar com a gente. Que tal marcarmos 15 minutos pra conversar?`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 60, // 2 meses
        message: `Oi! Só mais uma mensagem, prometo. Se ainda estiver considerando melhorar os meios de pagamento da empresa, o Felipe está à disposição para uma conversa rápida. Sem compromisso. 🤝`,
      },
      {
        stepNumber: 4,
        daysAfterLastContact: 90, // 3 meses
        message: `Olá! Última mensagem da minha parte. Se mudar de ideia ou quiser entender melhor o que a XPAG pode fazer pelo seu negócio, pode me chamar qualquer hora. Muito sucesso! 🙌`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  // ── Transferido mas consultor não fechou ──────────────────────────────────
  // Lead chegou ao consultor mas não virou cliente
  transferred_no_close: {
    scenario: 'transferred_no_close',
    label: 'Transferido sem fechamento',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 30, // 1 mês
        message: `Oi! Sei que você falou com o nosso consultor há um tempo. Queria saber se conseguiram resolver tudo ou se ficou alguma dúvida em aberto. Pode me contar! 😊`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 90, // 3 meses
        message: `Olá! Passaram-se alguns meses. Se por algum motivo a parceria não foi pra frente, entendo — às vezes o timing não é ideal. Se as coisas mudaram e quiser tentar novamente, estamos aqui. 👍`,
        updateStatus: 'Reativado',
        isFinal: true,
      },
    ],
  },

  // ── Reativação sazonal ────────────────────────────────────────────────────
  // Todos os leads inativos recebem uma mensagem leve em datas estratégicas
  seasonal_reactivation: {
    scenario: 'seasonal_reactivation',
    label: 'Reativação sazonal',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 180, // A cada 6 meses
        message: `Oi! Tudo bem? Passando para desejar um ótimo segundo semestre para o seu negócio! 🚀 Se tiver pensando em formas de otimizar os custos com pagamentos, pode contar com a gente. Qualquer coisa, é só chamar!`,
      },
    ],
  },
};

/**
 * Determina o cenário de follow-up para um lead baseado em seu status atual.
 */
export function detectFollowUpScenario(lead: {
  status_msg_wa: string | null;
  estagio_pipeline: string | null;
  data_ultima_interacao: string | null;
  follow_up_count: number | null;
}): FollowUpScenario | null {
  const status = lead.status_msg_wa ?? '';
  const estagio = lead.estagio_pipeline ?? '';

  if (status === 'Follow-up' && estagio.toLowerCase().includes('faturamento')) {
    return 'low_revenue';
  }

  if (status === 'Follow-up' || status === 'Sem Resposta') {
    const lastContact = lead.data_ultima_interacao ? new Date(lead.data_ultima_interacao) : null;
    if (lastContact) {
      const daysSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 3 ? 'no_response_long' : null;
    }
  }

  if (status === 'Qualificado' || estagio === 'Qualificação') {
    return 'qualified_not_closed';
  }

  if (status === 'Transferido' || estagio === 'Transferido para Consultor') {
    return 'transferred_no_close';
  }

  if (status === 'Inativo') {
    return 'seasonal_reactivation';
  }

  return null;
}
