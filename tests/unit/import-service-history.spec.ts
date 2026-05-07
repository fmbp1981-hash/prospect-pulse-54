import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn((table: string) => {
  if (table === 'import_history') return { insert: mockInsert };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    like: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    single: vi.fn().mockResolvedValue({ data: null }),
    update: vi.fn().mockReturnThis(),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { runImport } from '@/lib/import/import-service';

const sampleLead = {
  empresa: 'Acme', contato: null, whatsapp: null, telefone: null,
  email: null, cidade: null, bairro: null, categoria: null, cnpj: null,
  website: null, instagram: null, linkedin: null, resumo_analitico: null,
  warnings: {}, errors: {},
};

describe('runImport — import_history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('grava em import_history com source=webhook por padrão', async () => {
    await runImport('user-123', [sampleLead]);
    expect(mockFrom).toHaveBeenCalledWith('import_history');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-123', source: 'webhook' })
    );
  });

  it('grava source=google_drive quando passado em metadata', async () => {
    await runImport('user-456', [{ ...sampleLead, empresa: 'Beta' }], {}, { source: 'google_drive', filename: 'apollo.csv' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'google_drive', filename: 'apollo.csv' })
    );
  });

  it('grava contagens corretas', async () => {
    const report = await runImport('user-789', [{ ...sampleLead, empresa: 'Gamma' }], {}, { source: 'manual' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        errors: report.errors,
        import_id: report.importId,
      })
    );
  });
});
