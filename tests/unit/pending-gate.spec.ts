/**
 * TESTES: gate de pending_setup (admin identificado por role, nunca por e-mail)
 */

import { describe, it, expect } from 'vitest';
import { shouldBlockPendingUser } from '../../lib/supabase/pending-gate';

describe('shouldBlockPendingUser', () => {
  it('bloqueia quando não há settings', () => {
    expect(shouldBlockPendingUser(null)).toBe(true);
  });
  it('bloqueia usuário com pending_setup true', () => {
    expect(shouldBlockPendingUser({ pending_setup: true, role: 'operador' })).toBe(true);
  });
  it('não bloqueia pending_setup null', () => {
    expect(shouldBlockPendingUser({ pending_setup: null, role: 'visualizador' })).toBe(false);
  });
  it('não bloqueia pending_setup false', () => {
    expect(shouldBlockPendingUser({ pending_setup: false, role: 'operador' })).toBe(false);
  });
  it('admin nunca é bloqueado', () => {
    expect(shouldBlockPendingUser({ pending_setup: true, role: 'admin' })).toBe(false);
  });
});
