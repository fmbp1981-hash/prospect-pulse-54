/**
 * Régua de follow-up de longo prazo — a mesma para todas as organizações
 * (Sprint 2b, Task 8: sai o desvio `tenant_id === 'intellix'`) e com textos
 * neutros (sem nome de pessoa ou empresa remetente).
 */
import { describe, it, expect } from 'vitest';
import {
  FOLLOW_UP_SEQUENCES,
  detectFollowUpScenario,
  renderFollowUpMessage,
} from '@/lib/services/long-followup-rules.service';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function lead(overrides: Partial<Parameters<typeof detectFollowUpScenario>[0]> = {}) {
  return {
    status_msg_wa: null,
    estagio_pipeline: null,
    data_ultima_interacao: daysAgo(10),
    follow_up_count: 0,
    opt_out: false,
    ...overrides,
  };
}

describe('detectFollowUpScenario — régua padrão para qualquer organização', () => {
  it('qualificado sem agendamento', () => {
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Qualificado' }))).toBe('qualified_not_scheduled');
    expect(detectFollowUpScenario(lead({ estagio_pipeline: 'Qualificação' }))).toBe('qualified_not_scheduled');
  });

  it('transferido sem contato do consultor', () => {
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Transferido' }))).toBe('transferred_no_contact');
    expect(
      detectFollowUpScenario(lead({ status_msg_wa: 'Qualificado', estagio_pipeline: 'Transferido para Consultor' }))
    ).toBe('transferred_no_contact');
  });

  it('não compareceu à reunião', () => {
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'no_show' }))).toBe('meeting_no_show');
    expect(detectFollowUpScenario(lead({ estagio_pipeline: 'Reunião Não Realizada' }))).toBe('meeting_no_show');
  });

  it('fechado perdido há 90+ dias → reativação; antes disso, nada', () => {
    expect(
      detectFollowUpScenario(lead({ status_msg_wa: 'Fechado Perdido', data_ultima_interacao: daysAgo(100) }))
    ).toBe('lost_reactivation');
    expect(
      detectFollowUpScenario(lead({ status_msg_wa: 'Fechado Perdido', data_ultima_interacao: daysAgo(10) }))
    ).toBeNull();
  });

  it('sem resposta há 3+ dias → régua completa; antes disso, nada', () => {
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Sem Resposta', data_ultima_interacao: daysAgo(5) }))).toBe(
      'no_response_initial'
    );
    expect(detectFollowUpScenario(lead({ estagio_pipeline: 'Contato Inicial', data_ultima_interacao: daysAgo(1) }))).toBeNull();
  });

  it('follow-up por faturamento → fora do perfil; inativo → reativação sazonal', () => {
    expect(
      detectFollowUpScenario(lead({ status_msg_wa: 'Follow-up', estagio_pipeline: 'Faturamento baixo' }))
    ).toBe('low_revenue');
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Inativo' }))).toBe('seasonal_reactivation');
  });

  it('opt_out e teto de 7 toques bloqueiam qualquer cenário', () => {
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Qualificado', opt_out: true }))).toBeNull();
    expect(detectFollowUpScenario(lead({ status_msg_wa: 'Qualificado', follow_up_count: 7 }))).toBeNull();
  });

  it('não depende de tenant: a função não recebe tenant_id', () => {
    const input = lead({ status_msg_wa: 'Qualificado' });
    expect(Object.keys(input)).not.toContain('tenant_id');
    expect(detectFollowUpScenario(input)).toBe('qualified_not_scheduled');
  });
});

describe('textos neutros', () => {
  const PROIBIDOS = /felipe|\bbia\b|intellix|dirceu|nordeste|\[gatilho\]/i;

  it('nenhuma mensagem ou rótulo cita pessoa, empresa remetente ou evento', () => {
    const offenders = Object.values(FOLLOW_UP_SEQUENCES).flatMap((seq) => [
      ...(PROIBIDOS.test(seq.label) ? [`${seq.scenario}: label`] : []),
      ...seq.steps
        .filter((step) => PROIBIDOS.test(step.message))
        .map((step) => `${seq.scenario}#${step.stepNumber}`),
    ]);
    expect(offenders).toEqual([]);
  });
});

describe('renderFollowUpMessage', () => {
  it('preenche nome (primeiro) e empresa', () => {
    expect(renderFollowUpMessage('Oi, {{1}}! E a {{2}}?', { contato: ' Ana Lima ', empresa: 'ACME' })).toBe(
      'Oi, Ana! E a ACME?'
    );
  });

  it('sem nome: "Oi, {{1}}!" vira "Oi!" e demais {{1}} viram "Olá"; sem empresa: "sua empresa"', () => {
    expect(renderFollowUpMessage('Oi, {{1}}! E a {{2}}?', { contato: null, empresa: null })).toBe(
      'Oi! E a sua empresa?'
    );
    expect(renderFollowUpMessage('{{1}}, tudo bem?', {})).toBe('Olá, tudo bem?');
  });

  it('placeholder desconhecido → null', () => {
    expect(renderFollowUpMessage('{{3}} oi', { contato: 'Ana', empresa: 'X' })).toBeNull();
  });

  it('todas as mensagens da régua ficam sem {{n}} com e sem dados do lead', () => {
    for (const seq of Object.values(FOLLOW_UP_SEQUENCES)) {
      for (const step of seq.steps) {
        expect(renderFollowUpMessage(step.message, { contato: 'Ana', empresa: 'X' })).not.toBeNull();
        expect(renderFollowUpMessage(step.message, {})).not.toBeNull();
      }
    }
  });
});
