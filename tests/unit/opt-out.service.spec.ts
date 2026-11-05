/**
 * TASK-002 (opt-out) — serviço + repositório com Supabase falso.
 * AC-003: operador/visualizador não revoga; recusa antes de chamar o banco.
 * AC-004: revogação sem motivo válido não chega ao banco.
 * AC-005: formatos diferentes do mesmo número chegam iguais ao banco.
 * AC-010: consulta em lote só com .in() por coluna, sempre filtrada pela
 *         organização e por status ativo; até 3 consultas num lote comum.
 * O que é transação, idempotência e isolamento no banco está em
 * tests/db/contact-opt-out-rpcs.sql.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const ORG_A = '10000000-0000-4000-8000-00000000000a';
const USER = '20000000-0000-4000-8000-000000000001';
const OPT_OUT_ID = '30000000-0000-4000-8000-000000000001';

let handlerImpl: (call: FakeCall) => FakeResult | undefined = () => undefined;
const fake = createFakeSupabase((call) => handlerImpl(call));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));

const { requireWriter, requireOrgAdmin } = vi.hoisted(() => ({
  requireWriter: vi.fn(async () => true),
  requireOrgAdmin: vi.fn(async () => true),
}));
vi.mock('@/lib/auth/require-writer', () => ({ requireWriter, requireOrgAdmin }));

import { OptOutError, optOutService } from '@/lib/services/opt-out.service';
import { chunkInValues } from '@/lib/repositories/opt-out.repository';

function rpcOk(changed: boolean): FakeResult {
  return { data: [{ opt_out_id: OPT_OUT_ID, changed }], error: null };
}

async function expectOptOutError(promise: Promise<unknown>, code: string, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(OptOutError);
  expect((error as OptOutError).code).toBe(code);
  expect((error as OptOutError).status).toBe(status);
}

beforeEach(() => {
  fake.calls.length = 0;
  handlerImpl = () => undefined;
  requireWriter.mockReset().mockResolvedValue(true);
  requireOrgAdmin.mockReset().mockResolvedValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('register', () => {
  it('chama a função do banco com telefone normalizado, organização e autor (AC-001/AC-005)', async () => {
    handlerImpl = (call) => (call.table === 'rpc:register_contact_opt_out' ? rpcOk(true) : undefined);

    const result = await optOutService.register(
      ORG_A,
      { phone: '(11) 99999-0000', email: ' Titular@Exemplo.com', source: 'usuario', leadId: 'Lead-001' },
      { type: 'usuario', userId: USER }
    );

    expect(result).toEqual({ optOutId: OPT_OUT_ID, changed: true, status: 'active' });
    expect(requireWriter).toHaveBeenCalledWith(USER);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].payload).toEqual({
      p_organization_id: ORG_A,
      p_source: 'usuario',
      p_actor_type: 'usuario',
      p_phone_e164: '+5511999990000',
      p_email_normalized: 'titular@exemplo.com',
      p_actor_user_id: USER,
      p_lead_id: 'Lead-001',
      p_evidence_message_id: undefined,
    });
  });

  it.each(['(11) 99999-0000', '+55 11 99999-0000', '011999990000', '5511999990000'])(
    '%s chega ao banco como +5511999990000 (AC-005)',
    async (phone) => {
      handlerImpl = () => rpcOk(false);
      await optOutService.register(ORG_A, { phone, source: 'link_email' }, { type: 'titular' });
      expect((fake.calls[0].payload as { p_phone_e164: string }).p_phone_e164).toBe('+5511999990000');
    }
  );

  it('pedido repetido devolve changed = false e continua ativa (AC-002)', async () => {
    handlerImpl = () => rpcOk(false);
    const result = await optOutService.register(ORG_A, { phone: '11999990000', source: 'agente_ia' }, { type: 'agente_ia' });
    expect(result).toEqual({ optOutId: OPT_OUT_ID, changed: false, status: 'active' });
  });

  it('titular, agente e sistema registram sem conferir papel de usuário', async () => {
    handlerImpl = () => rpcOk(true);
    await optOutService.register(ORG_A, { email: 'a@b.com', source: 'link_email' }, { type: 'titular' });
    await optOutService.register(ORG_A, { email: 'a@b.com', source: 'importacao' }, { type: 'sistema' });
    expect(requireWriter).not.toHaveBeenCalled();
    expect((fake.calls[0].payload as { p_actor_user_id?: string }).p_actor_user_id).toBeUndefined();
  });

  it('usuário sem papel de escrita é recusado antes do banco', async () => {
    requireWriter.mockResolvedValue(false);
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'usuario' }, { type: 'usuario', userId: USER }),
      'FORBIDDEN',
      403
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('telefone que não normaliza é recusado antes do banco (AC-005)', async () => {
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '12345', source: 'link_email' }, { type: 'titular' }),
      'VALIDATION_ERROR',
      400
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('origem incompatível com o autor é recusada', async () => {
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'usuario' }, { type: 'titular' }),
      'VALIDATION_ERROR',
      400
    );
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'agente_ia' }, { type: 'usuario', userId: USER }),
      'VALIDATION_ERROR',
      400
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('sem organização resolvida é recusado', async () => {
    await expectOptOutError(
      optOutService.register('', { phone: '11999990000', source: 'link_email' }, { type: 'titular' }),
      'VALIDATION_ERROR',
      400
    );
  });

  it('erro do banco: 42501 vira FORBIDDEN; 23514 vira VALIDATION_ERROR; outro vira DB_ERROR', async () => {
    handlerImpl = () => ({ data: null, error: { message: 'sem permissão', code: '42501' } });
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'usuario' }, { type: 'usuario', userId: USER }),
      'FORBIDDEN',
      403
    );

    handlerImpl = () => ({ data: null, error: { message: 'check', code: '23514' } });
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'link_email' }, { type: 'titular' }),
      'VALIDATION_ERROR',
      400
    );

    handlerImpl = () => ({ data: null, error: { message: 'timeout', code: '57014' } });
    await expectOptOutError(
      optOutService.register(ORG_A, { phone: '11999990000', source: 'link_email' }, { type: 'titular' }),
      'DB_ERROR',
      500
    );
  });
});

describe('revoke', () => {
  it('admin revoga com motivo: chama a função com organização, id, motivo limpo e autor', async () => {
    handlerImpl = (call) => (call.table === 'rpc:revoke_contact_opt_out' ? rpcOk(true) : undefined);

    const result = await optOutService.revoke(
      ORG_A,
      { optOutId: OPT_OUT_ID, reason: '  novo consentimento do titular ' },
      { userId: USER }
    );

    expect(result).toEqual({ optOutId: OPT_OUT_ID, changed: true, status: 'revoked' });
    expect(requireOrgAdmin).toHaveBeenCalledWith(USER);
    expect(fake.calls[0].payload).toEqual({
      p_organization_id: ORG_A,
      p_opt_out_id: OPT_OUT_ID,
      p_reason: 'novo consentimento do titular',
      p_actor_user_id: USER,
    });
  });

  it('operador ou visualizador é recusado antes do banco (AC-003)', async () => {
    requireOrgAdmin.mockResolvedValue(false);
    await expectOptOutError(
      optOutService.revoke(ORG_A, { optOutId: OPT_OUT_ID, reason: 'novo consentimento' }, { userId: USER }),
      'FORBIDDEN',
      403
    );
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    ['sem motivo', undefined],
    ['só espaços', '     '],
    ['mais de 500 caracteres', 'x'.repeat(501)],
  ])('admin %s é recusado por validação e nada vai ao banco (AC-004)', async (_label, reason) => {
    await expectOptOutError(
      optOutService.revoke(ORG_A, { optOutId: OPT_OUT_ID, reason }, { userId: USER }),
      'VALIDATION_ERROR',
      400
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('id de outra organização volta como NOT_FOUND (P0002, AC-007)', async () => {
    handlerImpl = () => ({ data: null, error: { message: 'não encontrada', code: 'P0002' } });
    await expectOptOutError(
      optOutService.revoke(ORG_A, { optOutId: OPT_OUT_ID, reason: 'novo consentimento' }, { userId: USER }),
      'NOT_FOUND',
      404
    );
  });
});

describe('checkBlocked (AC-010)', () => {
  const rows = [
    { id: 'opt-lead', lead_id: 'Lead-001', phone_e164: null, email_normalized: null },
    { id: 'opt-phone', lead_id: null, phone_e164: '+5511999990000', email_normalized: null },
    { id: 'opt-email', lead_id: null, phone_e164: null, email_normalized: 'a,b(c)@exemplo.com' },
  ];

  function lookupHandler(call: FakeCall): FakeResult | undefined {
    if (call.table !== 'contact_opt_outs' || call.op !== 'select') return undefined;
    const inFilter = call.filters.find((f) => f.kind === 'in');
    if (!inFilter) return { data: [], error: null };
    const values = inFilter.value as string[];
    const column = inFilter.column as 'lead_id' | 'phone_e164' | 'email_normalized';
    return { data: rows.filter((r) => r[column] !== null && values.includes(r[column] as string)), error: null };
  }

  it('lote comum: no máximo 3 consultas, só .in(), filtradas por organização e status', async () => {
    handlerImpl = lookupHandler;

    const result = await optOutService.checkBlocked(ORG_A, [
      { leadId: 'Lead-001' },
      { phone: '(11) 99999-0000' },
      { email: 'A,B(c)@Exemplo.com' },
      { phone: '11988887777', email: 'livre@exemplo.com', leadId: 'Lead-002' },
    ]);

    expect(result).toEqual([
      { blocked: true, optOutIds: ['opt-lead'] },
      { blocked: true, optOutIds: ['opt-phone'] },
      { blocked: true, optOutIds: ['opt-email'] },
      { blocked: false, optOutIds: [] },
    ]);

    expect(fake.calls).toHaveLength(3);
    for (const call of fake.calls) {
      expect(call.table).toBe('contact_opt_outs');
      expect(filterValue(call, 'organization_id')).toBe(ORG_A);
      expect(filterValue(call, 'status')).toBe('active');
      expect(call.filters.some((f) => f.kind === 'or')).toBe(false);
      expect(call.filters.filter((f) => f.kind === 'in')).toHaveLength(1);
    }
    expect(fake.calls.map((c) => c.filters.find((f) => f.kind === 'in')?.column)).toEqual([
      'lead_id',
      'phone_e164',
      'email_normalized',
    ]);
  });

  it('só gera consulta para os identificadores presentes', async () => {
    handlerImpl = lookupHandler;
    await optOutService.checkBlocked(ORG_A, [{ phone: '11999990000' }, { phone: '+5511999990000' }]);
    expect(fake.calls).toHaveLength(1);
    expect(filterValue(fake.calls[0], 'phone_e164', 'in')).toEqual(['+5511999990000']);
  });

  it('1000 destinatários: toda consulta é .in() com organização, sem .or()', async () => {
    handlerImpl = lookupHandler;
    const targets = Array.from({ length: 1000 }, (_, i) => ({
      phone: `+551199${String(i).padStart(7, '0')}`,
      email: `pessoa.${i}@exemplo-de-dominio.com.br`,
    }));

    const result = await optOutService.checkBlocked(ORG_A, targets);

    expect(result).toHaveLength(1000);
    expect(fake.calls.length).toBeGreaterThanOrEqual(2);
    for (const call of fake.calls) {
      expect(filterValue(call, 'organization_id')).toBe(ORG_A);
      expect(call.filters.some((f) => f.kind === 'or')).toBe(false);
    }
    const sent = fake.calls.flatMap((c) => c.filters.filter((f) => f.kind === 'in').flatMap((f) => f.value as string[]));
    expect(sent).toHaveLength(2000);
  });

  it('erro do banco é lançado (quem envia trata como bloqueado)', async () => {
    handlerImpl = () => ({ data: null, error: { message: 'timeout', code: '57014' } });
    await expectOptOutError(optOutService.checkBlocked(ORG_A, [{ leadId: 'Lead-001' }]), 'DB_ERROR', 500);
  });

  it('mais de 1000 destinatários é recusado por validação', async () => {
    const targets = Array.from({ length: 1001 }, () => ({ leadId: 'Lead-001' }));
    await expectOptOutError(optOutService.checkBlocked(ORG_A, targets), 'VALIDATION_ERROR', 400);
    expect(fake.calls).toHaveLength(0);
  });

  it('isBlocked consulta um destinatário', async () => {
    handlerImpl = lookupHandler;
    expect(await optOutService.isBlocked(ORG_A, { email: 'a,b(c)@exemplo.com' })).toEqual({
      blocked: true,
      optOutIds: ['opt-email'],
    });
  });
});

describe('chunkInValues', () => {
  it('mantém lista pequena numa parte só e divide lista grande sem perder valores', () => {
    expect(chunkInValues(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
    const many = Array.from({ length: 500 }, (_, i) => `pessoa.${i}@exemplo.com`);
    const chunks = chunkInValues(many, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(many);
  });
});
