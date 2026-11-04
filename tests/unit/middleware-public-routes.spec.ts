/**
 * Rotas de API públicas no middleware (sem sessão). A rota interna do
 * consumidor da fila entra só pelo caminho exato.
 */
import { describe, it, expect } from 'vitest';
import { isPublicApiPath } from '../../lib/supabase/middleware';

describe('isPublicApiPath', () => {
  it.each([
    '/api/internal/follow-up/process',
    '/api/cron/follow-up',
    '/api/webhooks/whatsapp',
    '/api/leads/import/webhook',
    '/api/admin/init-user-settings',
  ])('%s é pública', (path) => {
    expect(isPublicApiPath(path)).toBe(true);
  });

  it.each([
    '/api/internal/follow-up/process/x',
    '/api/internal/follow-up/other',
    '/api/internal/follow-up/',
    '/api/internal/follow-up/processx',
    '/api/leads',
  ])('%s não é pública', (path) => {
    expect(isPublicApiPath(path)).toBe(false);
  });
});
