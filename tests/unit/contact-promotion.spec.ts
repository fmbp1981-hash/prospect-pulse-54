/**
 * F-07 (High) — promoteToLead lia leads_prospeccao por converted_lead_id sem
 * filtrar o tenant (service_role) e devolvia o lead inteiro. Um contato que
 * aponta para um lead de outro tenant vazava esse lead.
 * Agora a leitura filtra user_id; lead alheio = sem vínculo (cria lead novo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const LEAD_A = '60000000-0000-0000-0000-00000000000a';
const LEAD_B = '60000000-0000-0000-0000-00000000000b';
const CONTACT = '70000000-0000-0000-0000-000000000001';

const leads: Record<string, { id: string; user_id: string; empresa: string; telefone: string }> = {
  [LEAD_A]: { id: LEAD_A, user_id: USER_A, empresa: 'Lead do A', telefone: '+5581000000001' },
  [LEAD_B]: { id: LEAD_B, user_id: USER_B, empresa: 'Lead SIGILOSO do B', telefone: '+5581000000002' },
};

function handler(call: FakeCall): FakeResult | undefined {
  if (call.table !== 'leads_prospeccao') return undefined;
  if (call.op === 'select' && filterValue(call, 'id')) {
    const lead = leads[filterValue(call, 'id') as string];
    const uid = filterValue(call, 'user_id') as string | undefined;
    // service_role: sem filtro de user_id a linha de qualquer tenant volta.
    if (!lead || (uid !== undefined && lead.user_id !== uid)) return { data: null, error: null };
    return { data: lead, error: null };
  }
  if (call.op === 'select') return { data: [], error: null }; // sequência Lead-NNN
  if (call.op === 'insert') {
    const p = call.payload as { id: string; user_id: string; empresa: string };
    return { data: { ...p }, error: null };
  }
  return undefined;
}

const fake = createFakeSupabase(handler);
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const { findById, findCompanyById, update } = vi.hoisted(() => ({
  findById: vi.fn(),
  findCompanyById: vi.fn(async () => null),
  update: vi.fn(async () => undefined),
}));
vi.mock('@/lib/repositories/contacts.repository', () => ({
  contactsRepository: { findById, findCompanyById, update },
}));

import { contactPromotionService } from '@/lib/services/contact-promotion.service';

function contact(convertedLeadId: string | null) {
  return {
    id: CONTACT,
    name: 'Contato',
    company_id: null,
    converted_lead_id: convertedLeadId,
    email: null,
    phone: null,
    linkedin_url: null,
    city: null,
    location_raw: null,
    role_title: null,
    headline: null,
  };
}

beforeEach(() => {
  fake.calls.length = 0;
  vi.clearAllMocks();
});

describe('F-07 — promoteToLead', () => {
  it('converted_lead_id de outro tenant: nunca devolve o lead alheio; cria lead novo do usuário', async () => {
    findById.mockResolvedValueOnce(contact(LEAD_B));
    const lead = await contactPromotionService.promoteToLead(CONTACT, USER_A);
    expect(lead.id).not.toBe(LEAD_B);
    expect(JSON.stringify(lead)).not.toContain('SIGILOSO');
    expect(lead.user_id).toBe(USER_A);
    const read = fake.calls.find((c) => c.table === 'leads_prospeccao' && filterValue(c, 'id') === LEAD_B);
    expect(filterValue(read as FakeCall, 'user_id')).toBe(USER_A);
    expect(update).toHaveBeenCalledWith(CONTACT, USER_A, { converted_lead_id: lead.id });
  });

  it('converted_lead_id próprio: devolve o lead existente sem criar outro', async () => {
    findById.mockResolvedValueOnce(contact(LEAD_A));
    const lead = await contactPromotionService.promoteToLead(CONTACT, USER_A);
    expect(lead.id).toBe(LEAD_A);
    expect(fake.calls.some((c) => c.op === 'insert')).toBe(false);
  });
});
