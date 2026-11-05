/**
 * TASK-002 (opt-out) — normalização e validação da oposição.
 * AC-004: revogação sem motivo, só espaços ou > 500 caracteres é recusada.
 * AC-005: o mesmo número em formatos diferentes vira o mesmo E.164; número
 * que não normaliza é recusado.
 */
import { describe, it, expect } from 'vitest';
import {
  OPT_OUT_LOOKUP_MAX,
  lookupOptOutSchema,
  normalizeOptOutEmail,
  normalizeOptOutPhone,
  registerOptOutSchema,
  revokeOptOutSchema,
} from '@/lib/validations/opt-out.validation';

const OPT_OUT_ID = '80000000-0000-4000-8000-000000000001';

describe('normalizeOptOutPhone (AC-005)', () => {
  it.each(['(11) 99999-0000', '+55 11 99999-0000', '011999990000', '5511999990000', '11999990000'])(
    '%s vira +5511999990000',
    (raw) => {
      expect(normalizeOptOutPhone(raw)).toBe('+5511999990000');
    }
  );

  it('aceita fixo com 8 dígitos', () => {
    expect(normalizeOptOutPhone('(11) 3333-4444')).toBe('+551133334444');
  });

  it('aceita E.164 internacional com "+"', () => {
    expect(normalizeOptOutPhone('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it.each(['', 'abc', '12345', '+55 11 1234', '+55 (01) 99999-0000', '01199999000', '+0 123 4567 890'])(
    'recusa %j',
    (raw) => {
      expect(normalizeOptOutPhone(raw)).toBeNull();
    }
  );
});

describe('normalizeOptOutEmail', () => {
  it('minúsculas e sem espaços em volta', () => {
    expect(normalizeOptOutEmail('  Fulano.Silva@Exemplo.COM ')).toBe('fulano.silva@exemplo.com');
  });

  it('aceita vírgula e parêntese (o banco aceita)', () => {
    expect(normalizeOptOutEmail('a,b(c)@exemplo.com')).toBe('a,b(c)@exemplo.com');
  });

  it.each(['sem-arroba', 'a@b@c', 'com espaco@x.com', 'aspas"@x.com', 'barra\\@x.com', `${'a'.repeat(250)}@x.com`])(
    'recusa %j',
    (raw) => {
      expect(normalizeOptOutEmail(raw)).toBeNull();
    }
  );
});

describe('registerOptOutSchema', () => {
  it('normaliza telefone e e-mail', () => {
    const r = registerOptOutSchema.safeParse({
      phone: '(11) 99999-0000',
      email: ' Titular@Exemplo.com ',
      source: 'link_email',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe('+5511999990000');
      expect(r.data.email).toBe('titular@exemplo.com');
    }
  });

  it('exige telefone ou e-mail', () => {
    const r = registerOptOutSchema.safeParse({ leadId: 'Lead-001', source: 'usuario' });
    expect(r.success).toBe(false);
  });

  it('recusa telefone que não normaliza (AC-005)', () => {
    const r = registerOptOutSchema.safeParse({ phone: '12345', source: 'usuario' });
    expect(r.success).toBe(false);
  });

  it('recusa origem fora da lista', () => {
    const r = registerOptOutSchema.safeParse({ phone: '11999990000', source: 'outra' });
    expect(r.success).toBe(false);
  });

  it('id de mensagem só no formato de id (nunca texto)', () => {
    expect(
      registerOptOutSchema.safeParse({ phone: '11999990000', source: 'whatsapp_titular', evidenceMessageId: 'wamid.HBg=' })
        .success
    ).toBe(true);
    expect(
      registerOptOutSchema.safeParse({ phone: '11999990000', source: 'whatsapp_titular', evidenceMessageId: 'quero sair' })
        .success
    ).toBe(false);
  });
});

describe('revokeOptOutSchema (AC-004)', () => {
  it('aceita motivo válido e tira espaços em volta', () => {
    const r = revokeOptOutSchema.safeParse({ optOutId: OPT_OUT_ID, reason: '  novo consentimento  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe('novo consentimento');
  });

  it.each([
    ['sem motivo', undefined],
    ['motivo vazio', ''],
    ['só espaços', '   \t  '],
    ['curto demais', 'ok'],
    ['mais de 500 caracteres', 'x'.repeat(501)],
  ])('recusa %s', (_label, reason) => {
    expect(revokeOptOutSchema.safeParse({ optOutId: OPT_OUT_ID, reason }).success).toBe(false);
  });

  it('recusa id que não é uuid', () => {
    expect(revokeOptOutSchema.safeParse({ optOutId: '1', reason: 'novo consentimento' }).success).toBe(false);
  });
});

describe('lookupOptOutSchema', () => {
  it('aceita até OPT_OUT_LOOKUP_MAX e recusa acima', () => {
    const ok = Array.from({ length: OPT_OUT_LOOKUP_MAX }, () => ({ leadId: 'Lead-1' }));
    expect(lookupOptOutSchema.safeParse(ok).success).toBe(true);
    expect(lookupOptOutSchema.safeParse([...ok, { leadId: 'Lead-2' }]).success).toBe(false);
  });

  it('cada destinatário precisa de lead, telefone ou e-mail', () => {
    expect(lookupOptOutSchema.safeParse([{}]).success).toBe(false);
  });

  it('recusa telefone que não normaliza (AC-005)', () => {
    expect(lookupOptOutSchema.safeParse([{ phone: 'abc' }]).success).toBe(false);
  });
});
