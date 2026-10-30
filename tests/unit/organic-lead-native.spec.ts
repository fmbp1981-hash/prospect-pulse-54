/**
 * CARACTERIZAÇÃO: criação de lead orgânico pelo fluxo nativo (webhook Evolution).
 * Rede de segurança antes da renomeação do workflow de atendimento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindByWhatsApp, mockCreate } = vi.hoisted(() => ({
  mockFindByWhatsApp: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@/lib/repositories/lead.repository', () => ({
  leadRepository: {
    findByWhatsApp: mockFindByWhatsApp,
    create: mockCreate,
  },
}));

// generateNextLeadRef conta os leads do usuário via supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ count: 4 }),
      })),
    })),
  })),
}));

import { leadService } from '@/lib/services/lead.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function input(clienteWhatsApp: string) {
  return {
    clienteNome: 'Empresa Exemplo',
    clienteWhatsApp,
    clienteTelefone: '',
    userId: USER_ID,
  };
}

describe('leadService.findOrCreate — lead orgânico nativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    mockCreate.mockImplementation(async (row: Record<string, unknown>) => ({ ...row }));
  });

  it('cria lead novo com whatsapp normalizado quando o número não existe', async () => {
    mockFindByWhatsApp.mockResolvedValue(null);

    const result = await leadService.findOrCreate(input('11 99999-8888'));

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp: '+5511999998888',
        user_id: USER_ID,
        lead: 'Lead-005',
        categoria: 'Lead Orgânico',
        origem: 'WhatsApp Direto',
        modo_atendimento: 'bot',
      })
    );
    expect(result.isNew).toBe(true);
  });

  it('retorna o lead existente sem criar quando o número já existe', async () => {
    const existing = { id: 'ORG-1-abc', whatsapp: '+5511999998888' };
    mockFindByWhatsApp.mockResolvedValue(existing);

    const result = await leadService.findOrCreate(input('+5511999998888'));

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.isNew).toBe(false);
    expect(result.lead).toBe(existing);
  });

  it('não duplica o DDI quando o número já começa com 55', async () => {
    mockFindByWhatsApp.mockResolvedValue(null);

    await leadService.findOrCreate(input('5511999998888'));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp: '+5511999998888' })
    );
  });
});
