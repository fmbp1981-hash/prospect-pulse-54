/**
 * Registro de consumo por organização (usage_events). Nunca bloqueia a operação.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
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
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('usage_events').insert({
      organization_id: e.organizationId,
      category: e.category,
      provider: e.provider,
      operation: e.operation,
      quantity: e.quantity,
      unit: e.unit,
      connection_id: e.connectionId ?? null,
    });
    if (error) {
      console.error('[usage] falha ao registrar consumo', {
        organizationId: e.organizationId,
        provider: e.provider,
        operation: e.operation,
        reason: error.message,
      });
    }
  } catch (err) {
    console.error('[usage] falha ao registrar consumo', {
      organizationId: e.organizationId,
      provider: e.provider,
      operation: e.operation,
      reason: err instanceof Error ? err.message : 'erro desconhecido',
    });
  }
}
