/**
 * Contexto de organização do usuário autenticado e dos registros.
 */
import { connectionsRepository } from '@/lib/repositories/connections.repository';

export function resolveOrganizationIdForUser(userId: string): Promise<string | null> {
  return connectionsRepository.findOrganizationIdForUser(userId);
}

/**
 * Organização dona de um lead: `leads_prospeccao.organization_id`.
 *
 * Leads inseridos com service_role (webhook, jobs) ficam com organization_id
 * nulo, porque o trigger `set_organization_id_from_member` usa auth.uid().
 * Nesse caso a organização é derivada do dono do lead (user_id → membership),
 * a mesma regra do backfill da migration 20260916000000 — nunca outra
 * organização nem um valor padrão. Sem os dois → null.
 */
export async function resolveLeadOrganizationId(lead: {
  organization_id?: string | null;
  user_id?: string | null;
}): Promise<string | null> {
  if (lead.organization_id) return lead.organization_id;
  if (!lead.user_id) return null;
  return resolveOrganizationIdForUser(lead.user_id);
}
