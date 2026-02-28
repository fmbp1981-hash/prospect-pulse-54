/**
 * JOB DE FOLLOW-UP DE LONGO PRAZO
 *
 * Rodado 1x por dia (cron: 0 9 * * *)
 * Verifica a tabela followup_schedules por itens vencidos e executa.
 *
 * Fluxo:
 * 1. Busca schedules com due_at <= agora e status = 'pending'
 * 2. Para cada schedule: busca lead, valida cenário ainda aplicável
 * 3. Humaniza a mensagem template
 * 4. Envia via WhatsApp provider
 * 5. Agenda próximo step (se houver) ou marca como concluído
 */

import { createClient } from '@supabase/supabase-js';
import { FOLLOW_UP_SEQUENCES, detectFollowUpScenario } from '../services/long-followup-rules.service';
import type { FollowUpScenario } from '../services/long-followup-rules.service';
import { getWhatsAppProvider } from '../integrations/whatsapp/whatsapp.factory';
import { humanizeResponse } from '../services/message-humanizer.service';
import { WorkflowLogger } from '../workflow-engine/workflow.logger';
import { leadRepository } from '../repositories/lead.repository';
import { delay } from '../utils/delay';
import { randomUUID } from 'crypto';

interface FollowUpScheduleRow {
  id: string;
  lead_id: string;
  scenario: FollowUpScenario;
  step_number: number;
  due_at: string;
  status: 'pending' | 'sent' | 'skipped' | 'failed';
  instance_name: string;
  user_id: string;
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runLongFollowUpJob(): Promise<void> {
  const logger = new WorkflowLogger('LongFollowUpJob', randomUUID());
  logger.info('Long follow-up job started');

  const supabase = getServiceClient();

  // 1. Busca schedules vencidos
  const { data: schedules, error } = await supabase
    .from('followup_schedules')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .limit(50)
    .order('due_at', { ascending: true });

  if (error) {
    logger.error('Failed to fetch schedules', { error: error.message });
    return;
  }

  if (!schedules || schedules.length === 0) {
    logger.debug('No pending schedules');
    return;
  }

  logger.info(`Processing ${schedules.length} schedules`);
  const provider = getWhatsAppProvider();

  for (const schedule of schedules as FollowUpScheduleRow[]) {
    try {
      // 2. Busca lead atualizado
      const lead = await leadRepository.findByWhatsApp(schedule.lead_id, schedule.user_id)
        .catch(() => null);

      if (!lead || !lead.whatsapp) {
        await markSchedule(supabase, schedule.id, 'skipped', 'Lead não encontrado ou sem WhatsApp');
        continue;
      }

      // 3. Verifica se o cenário ainda é válido (lead pode ter mudado de status)
      const currentScenario = detectFollowUpScenario({
        status_msg_wa: lead.status_msg_wa,
        estagio_pipeline: lead.estagio_pipeline,
        data_ultima_interacao: lead.data_ultima_interacao,
        follow_up_count: lead.follow_up_count as number | null,
      });

      if (currentScenario !== schedule.scenario) {
        await markSchedule(supabase, schedule.id, 'skipped', `Scenario changed: ${schedule.scenario} → ${currentScenario ?? 'none'}`);
        logger.info('Schedule skipped — scenario changed', { leadId: lead.id, old: schedule.scenario, new: currentScenario });
        continue;
      }

      // 4. Busca a mensagem do step
      const sequence = FOLLOW_UP_SEQUENCES[schedule.scenario];
      const step = sequence?.steps.find((s) => s.stepNumber === schedule.step_number);

      if (!step) {
        await markSchedule(supabase, schedule.id, 'skipped', 'Step not found in sequence');
        continue;
      }

      // 5. Humaniza a mensagem
      const messages = await humanizeResponse(step.message).catch(() => [step.message]);

      // 6. Envia
      const { sent } = await provider.sendMessageSequence(
        schedule.instance_name,
        lead.whatsapp,
        messages,
        2000
      );

      if (sent > 0) {
        // 7. Atualiza status do lead se necessário
        if (step.updateStatus) {
          await leadRepository.update(lead.id, {
            status_msg_wa: step.updateStatus,
            data_ultima_interacao: new Date().toISOString(),
          });
        }

        await markSchedule(supabase, schedule.id, 'sent');

        // 8. Agenda próximo step
        if (!step.isFinal) {
          const nextStep = sequence.steps.find((s) => s.stepNumber === schedule.step_number + 1);
          if (nextStep) {
            const nextDue = new Date();
            nextDue.setDate(nextDue.getDate() + (nextStep.daysAfterLastContact - step.daysAfterLastContact));

            await supabase.from('followup_schedules').insert({
              lead_id: schedule.lead_id,
              scenario: schedule.scenario,
              step_number: nextStep.stepNumber,
              due_at: nextDue.toISOString(),
              status: 'pending',
              instance_name: schedule.instance_name,
              user_id: schedule.user_id,
            });
          }
        }

        logger.info('Follow-up sent', {
          leadId: lead.id,
          scenario: schedule.scenario,
          step: schedule.step_number,
          isFinal: step.isFinal,
        });
      } else {
        await markSchedule(supabase, schedule.id, 'failed', 'Send returned 0');
      }

      // Delay entre disparos para evitar spam
      await delay(3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Error processing schedule', { scheduleId: schedule.id, error: msg });
      await markSchedule(supabase, schedule.id, 'failed', msg);
    }
  }

  logger.info('Long follow-up job completed', { processed: schedules.length });
}

async function markSchedule(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
  status: 'sent' | 'skipped' | 'failed',
  reason?: string
) {
  await supabase
    .from('followup_schedules')
    .update({
      status,
      processed_at: new Date().toISOString(),
      ...(reason ? { skip_reason: reason } : {}),
    })
    .eq('id', id);
}

/**
 * Agenda o primeiro follow-up de longo prazo para um lead.
 * Chamado quando o lead muda para um status de follow-up.
 */
export async function scheduleFirstFollowUp(
  leadId: string,
  scenario: FollowUpScenario,
  instanceName: string,
  userId: string
): Promise<void> {
  const sequence = FOLLOW_UP_SEQUENCES[scenario];
  if (!sequence?.steps.length) return;

  const firstStep = sequence.steps[0];
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + firstStep.daysAfterLastContact);

  const supabase = getServiceClient();

  // Remove schedules pendentes anteriores para o mesmo lead+scenario
  await supabase
    .from('followup_schedules')
    .update({ status: 'skipped', skip_reason: 'Replaced by new schedule' })
    .eq('lead_id', leadId)
    .eq('scenario', scenario)
    .eq('status', 'pending');

  await supabase.from('followup_schedules').insert({
    id: randomUUID(),
    lead_id: leadId,
    scenario,
    step_number: firstStep.stepNumber,
    due_at: dueAt.toISOString(),
    status: 'pending',
    instance_name: instanceName,
    user_id: userId,
  });
}
