export interface PendingGateSettings {
  pending_setup: boolean | null;
  role: string | null;
}

/**
 * Decide se o usuário deve ser barrado em /pending.
 * Admin (por role) nunca é bloqueado; sem settings bloqueia; senão só se pending_setup === true.
 */
export function shouldBlockPendingUser(settings: PendingGateSettings | null): boolean {
  if (!settings) return true;
  if (settings.role === 'admin') return false;
  return settings.pending_setup === true;
}
