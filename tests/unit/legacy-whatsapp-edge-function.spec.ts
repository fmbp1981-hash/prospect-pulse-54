/**
 * F-08 (High) — a Edge Function legada supabase/functions/whatsapp-webhook
 * não tinha tenant nem segredo e interpolava filtro em .or(). Foi substituída
 * por /api/webhooks/evolution/<token> e não pode voltar ao repositório
 * (um `supabase functions deploy` a republicaria).
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('F-08 — Edge Function legada whatsapp-webhook', () => {
  it('não existe no repositório', () => {
    expect(existsSync(path.join(ROOT, 'supabase/functions/whatsapp-webhook'))).toBe(false);
  });
});
