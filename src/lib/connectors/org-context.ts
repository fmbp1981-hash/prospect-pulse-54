/**
 * Contexto de organização do usuário autenticado.
 */
import { connectionsRepository } from '@/lib/repositories/connections.repository';

export function resolveOrganizationIdForUser(userId: string): Promise<string | null> {
  return connectionsRepository.findOrganizationIdForUser(userId);
}
