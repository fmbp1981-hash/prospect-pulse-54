/**
 * Registro de consumo por organização (usage_events). Nunca bloqueia a operação.
 */
import { connectionsRepository } from '@/lib/repositories/connections.repository';
import type { ConnectorCategory, ProviderId, UsageUnit } from './types';

export interface UsageEvent {
  organizationId: string;
  category: ConnectorCategory;
  provider: ProviderId;
  operation: string;
  quantity: number;
  unit: UsageUnit;
  connectionId?: string;
}

export async function recordUsage(e: UsageEvent): Promise<void> {
  try {
    await connectionsRepository.insertUsage(e);
  } catch (err) {
    console.error('[usage] falha ao registrar consumo', {
      organizationId: e.organizationId,
      provider: e.provider,
      operation: e.operation,
      reason: err instanceof Error ? err.message : 'erro desconhecido',
    });
  }
}
