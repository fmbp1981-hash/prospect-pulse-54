/**
 * Serviço de ICP settings — valida entrada e traduz entre o formato de API
 * (camelCase) e o formato de banco (snake_case, arrays vazios como default).
 */

import { icpSettingsRepository } from '../repositories/icp-settings.repository';
import { icpSettingsSchema, type IcpSettingsFormData } from '../validations/icp-settings.validation';
import type { Database } from '@/integrations/supabase/types';

type IcpSettingsRow = Database['public']['Tables']['icp_settings']['Row'];

function toFormData(row: IcpSettingsRow | null): IcpSettingsFormData {
  if (!row) {
    return {
      targetCategories: [],
      targetCities: [],
      targetStates: [],
      targetSeniorities: [],
      targetDepartments: [],
      minEmployeeCount: null,
      maxEmployeeCount: null,
      requireContactChannel: true,
    };
  }
  return {
    targetCategories: row.target_categories ?? [],
    targetCities: row.target_cities ?? [],
    targetStates: row.target_states ?? [],
    targetSeniorities: row.target_seniorities ?? [],
    targetDepartments: row.target_departments ?? [],
    minEmployeeCount: row.min_employee_count,
    maxEmployeeCount: row.max_employee_count,
    requireContactChannel: row.require_contact_channel,
  };
}

export const icpSettingsService = {
  async get(userId: string): Promise<IcpSettingsFormData> {
    const row = await icpSettingsRepository.findByUserId(userId);
    return toFormData(row);
  },

  async update(userId: string, rawInput: unknown): Promise<IcpSettingsFormData> {
    const input = icpSettingsSchema.parse(rawInput);
    const row = await icpSettingsRepository.upsert(userId, {
      target_categories: input.targetCategories,
      target_cities: input.targetCities,
      target_states: input.targetStates,
      target_seniorities: input.targetSeniorities,
      target_departments: input.targetDepartments,
      min_employee_count: input.minEmployeeCount ?? null,
      max_employee_count: input.maxEmployeeCount ?? null,
      require_contact_channel: input.requireContactChannel,
    });
    return toFormData(row);
  },
};
