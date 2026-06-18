/**
 * REGRAS DE FOLLOW-UP DE LONGO PRAZO
 *
 * XPAG: cenários originais (low_revenue, no_response_long, qualified_not_closed,
 *        transferred_no_close, seasonal_reactivation)
 * IntelliX — Campanha Encontro & Relacionamento:
 *   no_response_initial · qualified_not_scheduled · transferred_no_contact
 *   meeting_no_show · lost_reactivation · seasonal_reengage
 *
 * Regras globais anti-inconveniência (seção 2 da ESTRATEGIA):
 *   - Teto de 7 toques por lead (toda a jornada)
 *   - opt_out = true → nunca mais disparar nada
 *   - Janela útil: 9h–18h BRT, seg–sex
 *   - Resposta do lead pausa sequência (cenário muda → job pula o step)
 *   - Espaçamento crescente: garantido pelas offsets dos steps
 *   - Um CTA por mensagem (garantido pelo conteúdo)
 */

export type FollowUpScenario =
  // ── XPAG ──────────────────────────────────────────────────────────────────
  | 'low_revenue'               // Faturamento < R$50k/mês
  | 'no_response_short'         // Curto prazo (handled by follow-up.job.ts)
  | 'no_response_long'          // Sem resposta >3 dias (XPAG)
  | 'qualified_not_closed'      // Qualificado mas não fechou (XPAG)
  | 'transferred_no_close'      // Transferido mas consultor não fechou (XPAG)
  | 'seasonal_reactivation'     // Reativação sazonal (XPAG)
  // ── IntelliX — Campanha Encontro & Relacionamento ─────────────────────────
  | 'no_response_initial'       // Sem resposta: D+3, D+7, D+14, D+30 (4 passos)
  | 'no_response_followup'      // Legado — mantido para compatibilidade (não roteado)
  | 'goodbye'                   // Legado — mantido para compatibilidade (não roteado)
  | 'qualified_not_scheduled'   // Qualificado sem agendamento: D+1, D+3, D+7 (3 passos)
  | 'transferred_no_contact'    // Transferido, Felipe não contatou: D+2, D+5 (2 passos)
  | 'meeting_no_show'           // Faltou à reunião: D+0, D+3 (2 passos)
  | 'lost_reactivation'         // Reativação trimestral: D+90, D+180, D+270 (3 ciclos)
  | 'seasonal_reengage'         // Reaquecimento por valor: 1 disparo manual/gatilho

export interface FollowUpStep {
  stepNumber: number;
  /** Offset cumulativo em dias a partir do gatilho inicial. Job usa o delta entre steps. */
  daysAfterLastContact: number;
  message: string;
  updateStatus?: string;
  isFinal?: boolean;
  requiresTemplate?: boolean; // [template] = precisa de HSM aprovado pela Meta
}

export interface FollowUpSequence {
  scenario: FollowUpScenario;
  label: string;
  steps: FollowUpStep[];
}

export const FOLLOW_UP_SEQUENCES: Record<FollowUpScenario, FollowUpSequence> = {

  // ══════════════════════════════════════════════════════════════════════════
  // XPAG — cenários originais
  // ══════════════════════════════════════════════════════════════════════════

  low_revenue: {
    scenario: 'low_revenue',
    label: 'Faturamento abaixo do mínimo (XPAG)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 90,
        message: `Oi! Tudo bem por aí? 😊 Passando para saber como está indo o negócio. Às vezes as coisas mudam rápido, né? Se quiser conversar sobre como otimizar os pagamentos da sua empresa, pode contar comigo!`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 180,
        message: `Olá! Sei que faz um tempo desde nosso último contato. Muita coisa pode ter mudado na sua empresa em 6 meses. Se o faturamento cresceu e você quer explorar formas de economizar nas taxas de cartão, seria ótimo conversar. O que acha?`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 365,
        message: `Olá! É a última mensagem que envio, mas queria deixar a porta aberta: se em algum momento seu faturamento crescer acima de R$50k/mês, a XPAG pode gerar uma economia real pra você. Qualquer hora pode me chamar. Cuide-se! 👋`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  no_response_short: {
    scenario: 'no_response_short',
    label: 'Sem resposta curto prazo (XPAG — coberto pelo follow-up.job.ts)',
    steps: [],
  },

  no_response_long: {
    scenario: 'no_response_long',
    label: 'Sem resposta longo prazo (XPAG)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 7,
        message: `Oi! Sei que o dia a dia corrido não deixa tempo pra muita coisa. Se ainda tiver interesse em otimizar os custos com pagamentos da sua empresa, é só me falar. Sem pressa! 😊`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 21,
        message: `Olá! Passando para checar se teve alguma mudança por aí. Às vezes a gente deixa passar uma oportunidade por falta de tempo mesmo. Se quiser retomar a conversa, pode me chamar quando quiser.`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 45,
        message: `Oi! Última tentativa de contato da minha parte. Se em algum momento fizer sentido conversar sobre formas de reduzir taxas e organizar melhor os pagamentos, estarei por aqui. Boa sorte com o negócio! 🤝`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  qualified_not_closed: {
    scenario: 'qualified_not_closed',
    label: 'Qualificado sem fechamento (XPAG)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 14,
        message: `Oi! Sei que ficou de pensar na proposta. Queria só saber se surgiu alguma dúvida que eu possa ajudar a esclarecer. A oportunidade de reduzir as taxas ainda está em aberto! 💪`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 30,
        message: `Olá! Um mês se passou. Às vezes é difícil encontrar o momento certo pra tomar uma decisão, eu entendo. Mas posso te dizer que vários empresários que estavam na mesma situação que você economizaram bastante depois de falar com a gente. Que tal marcarmos 15 minutos pra conversar?`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 60,
        message: `Oi! Só mais uma mensagem, prometo. Se ainda estiver considerando melhorar os meios de pagamento da empresa, o Felipe está à disposição para uma conversa rápida. Sem compromisso. 🤝`,
      },
      {
        stepNumber: 4,
        daysAfterLastContact: 90,
        message: `Olá! Última mensagem da minha parte. Se mudar de ideia ou quiser entender melhor o que a XPAG pode fazer pelo seu negócio, pode me chamar qualquer hora. Muito sucesso! 🙌`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  transferred_no_close: {
    scenario: 'transferred_no_close',
    label: 'Transferido sem fechamento (XPAG)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 30,
        message: `Oi! Sei que você falou com o nosso consultor há um tempo. Queria saber se conseguiram resolver tudo ou se ficou alguma dúvida em aberto. Pode me contar! 😊`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 90,
        message: `Olá! Passaram-se alguns meses. Se por algum motivo a parceria não foi pra frente, entendo — às vezes o timing não é ideal. Se as coisas mudaram e quiser tentar novamente, estamos aqui. 👍`,
        updateStatus: 'Reativado',
        isFinal: true,
      },
    ],
  },

  seasonal_reactivation: {
    scenario: 'seasonal_reactivation',
    label: 'Reativação sazonal (XPAG)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 180,
        message: `Oi! Tudo bem? Passando para desejar um ótimo segundo semestre para o seu negócio! 🚀 Se tiver pensando em formas de otimizar os custos com pagamentos, pode contar com a gente. Qualquer coisa, é só chamar!`,
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // IntelliX — Campanha Encontro & Relacionamento
  // Canal exclusivo: WhatsApp oficial Meta Cloud API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sem resposta após template inicial — 4 passos (D+3, D+7, D+14, D+30).
   * Cada passo usa um ângulo diferente: prova social → dor → autoridade → despedida.
   * Todos os passos = [template] (fora da janela de 24h do lead).
   */
  no_response_initial: {
    scenario: 'no_response_initial',
    label: 'Sem resposta — régua completa (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 3,
        requiresTemplate: true,
        message: `Oi, {{1}}! Voltando ao que conversamos no Encontro do Dirceu Cordeiro. Empresas parecidas com a {{2}} aqui no Nordeste estão reduzindo o tempo gasto com atendimento e follow-up repetitivo usando IA. Posso te mostrar em 2 minutos como? Se não for o momento, responda 'depois'.`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 7,
        requiresTemplate: true,
        message: `{{1}}, uma pergunta rápida: na {{2}}, o que mais toma tempo do time hoje — atendimento, cobrança, qualificação de lead ou relatório? Me diz só a palavra e eu te mando um caminho específico.`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 14,
        requiresTemplate: true,
        message: `{{1}}, sem cobrança nenhuma. A IntelliX tem um princípio: IA só vale quando gera resultado, e a gente fala quando NÃO vale. Se um dia quiser um diagnóstico honesto da {{2}}, é só me chamar.`,
      },
      {
        stepNumber: 4,
        daysAfterLastContact: 30,
        requiresTemplate: true,
        message: `{{1}}, vou encerrar o assunto por aqui para não te incomodar. Quando a {{2}} quiser entender onde a IA ajuda de verdade, é só responder. Fico à disposição. Abraço, Felipe — IntelliX.AI.`,
        updateStatus: 'Fechado Perdido',
        isFinal: true,
      },
    ],
  },

  /** Legado — não mais roteado. Mantido para compatibilidade com schedules existentes. */
  no_response_followup: {
    scenario: 'no_response_followup',
    label: 'Sem resposta follow-up — legado (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 7,
        message: `{{1}}, última tentativa. Qual processo na {{2}} mais toma tempo da equipe hoje: atendimento, cobrança, relatório ou prospecção? Me diz e eu te mando um resumo específico. Se não for o momento, responda "não agora".`,
      },
    ],
  },

  /** Legado — não mais roteado. Mantido para compatibilidade com schedules existentes. */
  goodbye: {
    scenario: 'goodbye',
    label: 'Despedida — legado (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 14,
        message: `{{1}}, sem problema se não for a hora. Fico por aqui. Quando a {{2}} quiser entender como a IA pode ajudar de verdade, sem promessa exagerada, é só me chamar. Abraço, Felipe — IntelliX.AI.`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  /**
   * Lead qualificado pela Bia mas sem horário marcado com o Felipe — 3 passos (D+1, D+3, D+7).
   * Objetivo: conduzir ao agendamento de 20 min de diagnóstico.
   */
  qualified_not_scheduled: {
    scenario: 'qualified_not_scheduled',
    label: 'Qualificado sem agendamento (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 1,
        message: `{{1}}, separei um espaço na agenda do Felipe essa semana para empresas que vieram do Encontro do Dirceu. São 20 minutos, ele analisa a operação da {{2}} ao vivo. Prefere de manhã ou à tarde?`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 3,
        requiresTemplate: true,
        message: `{{1}}, ainda dá para garantir um horário com o Felipe esta semana. Quer que eu reserve quinta ou sexta?`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 7,
        requiresTemplate: true,
        message: `{{1}}, não quero te pressionar. Deixo o convite aberto: quando quiser os 20 minutos de diagnóstico da {{2}} com o Felipe, é só me dizer o dia. Abraço!`,
        isFinal: true,
      },
    ],
  },

  /**
   * Lead transferido para Felipe mas sem contato em 2 dias — 2 passos (D+2, D+5).
   * Protege o handoff: mantém o lead aquecido e alerta internamente sobre SLA breach.
   * O job deve registrar audit_logs com action='HANDOFF_SLA_BREACH' no passo 1.
   */
  transferred_no_contact: {
    scenario: 'transferred_no_contact',
    label: 'Transferido sem contato do consultor (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 2,
        message: `{{1}}, o Felipe vai te chamar para aquela conversa rápida sobre a {{2}}. Confirma para mim: este WhatsApp é o melhor canal, ou prefere outro horário?`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 5,
        requiresTemplate: true,
        message: `{{1}}, só garantindo que não perdi você. Quer que eu já deixe um horário reservado com o Felipe para esta semana?`,
        isFinal: true,
      },
    ],
  },

  /**
   * Lead faltou à reunião agendada — 2 passos (D+0 ≈ 1h, D+3).
   * Passo 1 deve ser agendado com offset de 0 dias (disparado no mesmo dia da falta).
   */
  meeting_no_show: {
    scenario: 'meeting_no_show',
    label: 'Não compareceu à reunião (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 0,
        message: `{{1}}, acho que a gente se desencontrou no horário de hoje. Acontece! Quer remarcar para amanhã ou depois?`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 3,
        requiresTemplate: true,
        message: `{{1}}, fica fácil para você remarcar a conversa sobre a {{2}}? Me passa um dia e horário que eu ajusto com o Felipe.`,
        isFinal: true,
      },
    ],
  },

  /**
   * Reativação trimestral de leads Fechado Perdido — 3 ciclos (D+90, D+180, D+270).
   * Máximo 3 ciclos. Após ciclo 3 sem resposta: marcar reativacao_encerrada = true.
   * Cada ciclo usa um ângulo diferente: novidade → case → última chance.
   */
  lost_reactivation: {
    scenario: 'lost_reactivation',
    label: 'Reativação trimestral (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 90,
        requiresTemplate: true,
        message: `Oi, {{1}}! Faz um tempo. A IntelliX lançou novidades que podem encaixar na {{2}}. Posso te mandar um resumo de 1 minuto? Se não fizer sentido, é só ignorar.`,
      },
      {
        stepNumber: 2,
        daysAfterLastContact: 180,
        requiresTemplate: true,
        message: `{{1}}, ajudamos recentemente uma empresa parecida com a {{2}} a tirar tarefa repetitiva da mão do time. Quer ver como ficou? Sem compromisso.`,
      },
      {
        stepNumber: 3,
        daysAfterLastContact: 270,
        requiresTemplate: true,
        message: `{{1}}, última vez que te chamo por aqui para não virar incômodo. Se a IA entrar no radar da {{2}} algum dia, é só me responder. Abraço!`,
        updateStatus: 'Inativo',
        isFinal: true,
      },
    ],
  },

  /**
   * Reaquecimento por valor para leads inertes > 60 dias — 1 disparo por gatilho.
   * Disparado manualmente pelo operador ou por gatilho de data (evento, lançamento).
   * Conteúdo é sempre de valor, nunca de venda direta.
   */
  seasonal_reengage: {
    scenario: 'seasonal_reengage',
    label: 'Reaquecimento sazonal (IntelliX)',
    steps: [
      {
        stepNumber: 1,
        daysAfterLastContact: 0,
        requiresTemplate: true,
        message: `Oi, {{1}}! A IntelliX vai estar no próximo Encontro & Relacionamento. Aproveitando: preparei um material curto sobre [gatilho] que pode ser útil para a {{2}}. Quer que eu te envie?`,
        isFinal: true,
      },
    ],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

const MAX_FOLLOW_UP_TOUCHES = 7;

/**
 * Normaliza uma data para a próxima janela útil: 9h–18h BRT (UTC-3), seg–sex.
 * Usado ao agendar due_at dos steps.
 */
export function normalizeToBusinessHours(date: Date): Date {
  const d = new Date(date);
  // BRT = UTC-3
  const brtOffset = -3 * 60;
  const localMs = d.getTime() + (brtOffset - (-d.getTimezoneOffset())) * 60000;
  const brt = new Date(localMs);

  // Se fim de semana, avança para segunda
  while (brt.getDay() === 0 || brt.getDay() === 6) {
    brt.setDate(brt.getDate() + 1);
  }

  const hour = brt.getHours();
  if (hour < 9) {
    brt.setHours(9, 0, 0, 0);
  } else if (hour >= 18) {
    brt.setDate(brt.getDate() + 1);
    brt.setHours(9, 0, 0, 0);
    // Re-check weekend
    while (brt.getDay() === 0 || brt.getDay() === 6) {
      brt.setDate(brt.getDate() + 1);
    }
  }

  // Converte de volta para UTC
  const utcMs = brt.getTime() - (brtOffset - (-d.getTimezoneOffset())) * 60000;
  return new Date(utcMs);
}

/**
 * Verifica se o momento atual está dentro da janela útil (9h–18h BRT, seg–sex).
 * Usado como guarda antes de disparar follow-ups.
 */
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  const brtDay = new Date(now.getTime() - 3 * 3600000).getUTCDay(); // 0=Dom, 6=Sáb
  return brtDay >= 1 && brtDay <= 5 && brtHour >= 9 && brtHour < 18;
}

// ── Detecção de cenário ────────────────────────────────────────────────────

/**
 * Determina o cenário de follow-up de longo prazo para um lead.
 *
 * Para IntelliX: mapeia para os cenários da campanha Encontro & Relacionamento.
 * Para XPAG: mantém a lógica original.
 *
 * Retorna null se nenhum follow-up deve ser disparado (opt_out, teto atingido,
 * lead respondeu, cenário não identificado).
 */
export function detectFollowUpScenario(lead: {
  status_msg_wa: string | null;
  estagio_pipeline: string | null;
  data_ultima_interacao: string | null;
  follow_up_count: number | null;
  tenant_id?: string | null;
  opt_out?: boolean | null;
}): FollowUpScenario | null {
  // Regra global: opt_out → nunca mais
  if (lead.opt_out) return null;

  // Regra global: teto de 7 toques
  if ((lead.follow_up_count ?? 0) >= MAX_FOLLOW_UP_TOUCHES) return null;

  const status = lead.status_msg_wa ?? '';
  const estagio = lead.estagio_pipeline ?? '';

  if (lead.tenant_id === 'intellix') {
    const lastContact = lead.data_ultima_interacao
      ? new Date(lead.data_ultima_interacao)
      : null;
    const daysSince = lastContact
      ? (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    // Qualificado pela Bia mas sem horário marcado
    if (
      (status === 'Qualificado' || estagio === 'Qualificação') &&
      estagio !== 'Transferido para Consultor'
    ) {
      return 'qualified_not_scheduled';
    }

    // Transferido para Felipe mas sem contato em 2+ dias
    if (status === 'Transferido' || estagio === 'Transferido para Consultor') {
      return 'transferred_no_contact';
    }

    // Lead faltou à reunião
    if (status === 'no_show' || estagio === 'Reunião Não Realizada') {
      return 'meeting_no_show';
    }

    // Lead em Fechado Perdido → reativação trimestral (a partir de 90 dias)
    if (
      (status === 'Fechado Perdido' || estagio === 'Fechado Perdido') &&
      daysSince >= 90
    ) {
      return 'lost_reactivation';
    }

    // Sem resposta após template (Contato Inicial / Follow-up) → régua completa
    if (
      (status === 'Sem Resposta' ||
        status === 'Follow-up' ||
        estagio === 'Contato Inicial' ||
        estagio === 'Follow-up') &&
      daysSince >= 3
    ) {
      return 'no_response_initial';
    }

    return null;
  }

  // ── XPAG logic (original) ────────────────────────────────────────────────

  if (status === 'Follow-up' && estagio.toLowerCase().includes('faturamento')) {
    return 'low_revenue';
  }

  if (status === 'Follow-up' || status === 'Sem Resposta') {
    const lastContact = lead.data_ultima_interacao
      ? new Date(lead.data_ultima_interacao)
      : null;
    if (lastContact) {
      const daysSince =
        (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
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
