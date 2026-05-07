import { normalizePhone, normalizeText, normalizeEmail, normalizeCnpj, normalizeWebsite, normalizeInstagram, normalizeLinkedin, normalizeLeadRow } from '../../src/lib/import/normalizer';

describe('normalizePhone', () => {
  it('formata celular BR com parênteses e hífen', () => {
    expect(normalizePhone('(11) 99999-8888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número sem código de país (11 dígitos)', () => {
    expect(normalizePhone('11999998888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número com código 55 sem +', () => {
    expect(normalizePhone('5511999998888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('formata número com + e espaços', () => {
    expect(normalizePhone('+55 11 9 9999-8888')).toEqual({ value: '+5511999998888', warning: null, error: null });
  });
  it('retorna erro para número sem DDD', () => {
    const r = normalizePhone('99999-8888');
    expect(r.error).toBeTruthy();
    expect(r.value).toBeNull();
  });
  it('retorna null para 0800', () => {
    const r = normalizePhone('0800 123 4567');
    expect(r.error).toBeTruthy();
    expect(r.value).toBeNull();
  });
  it('emite warning para fixo com 8 dígitos no whatsapp', () => {
    const r = normalizePhone('(11) 3333-4444');
    expect(r.value).toBe('+551133334444');
    expect(r.warning).toMatch(/fixo/i);
  });
  it('retorna null para string vazia', () => {
    expect(normalizePhone('')).toEqual({ value: null, warning: null, error: null });
  });
});

describe('normalizeText', () => {
  it('aplica Title Case', () => {
    expect(normalizeText('CLÍNICA SÃO PEDRO')).toBe('Clínica São Pedro');
  });
  it('mantém preposições em minúsculo no meio', () => {
    expect(normalizeText('PADARIA DE MINAS')).toBe('Padaria de Minas');
  });
  it('capitaliza preposição no início', () => {
    expect(normalizeText('de minas gerais')).toBe('De Minas Gerais');
  });
  it('remove espaços extras', () => {
    expect(normalizeText('  empresa   teste  ')).toBe('Empresa Teste');
  });
});

describe('normalizeEmail', () => {
  it('converte para minúsculo e faz trim', () => {
    expect(normalizeEmail('  CONTATO@EMPRESA.COM.BR  ')).toEqual({ value: 'contato@empresa.com.br', error: null });
  });
  it('retorna erro para email inválido', () => {
    expect(normalizeEmail('sem-arroba').error).toBeTruthy();
  });
  it('retorna null para string vazia', () => {
    expect(normalizeEmail('')).toEqual({ value: null, error: null });
  });
});

describe('normalizeCnpj', () => {
  it('formata CNPJ de 14 dígitos', () => {
    expect(normalizeCnpj('12345678000195')).toEqual({ value: '12.345.678/0001-95', error: null });
  });
  it('retorna error para CNPJ com dígitos inválidos', () => {
    expect(normalizeCnpj('12345678000199').error).toBeTruthy();
  });
  it('aceita CNPJ já formatado', () => {
    expect(normalizeCnpj('12.345.678/0001-95')).toEqual({ value: '12.345.678/0001-95', error: null });
  });
});

describe('normalizeWebsite', () => {
  it('adiciona https:// se ausente', () => {
    expect(normalizeWebsite('empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('faz upgrade de http para https', () => {
    expect(normalizeWebsite('http://empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('mantém https intacto', () => {
    expect(normalizeWebsite('https://empresa.com.br')).toBe('https://empresa.com.br');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeWebsite('')).toBeNull();
  });
});

describe('normalizeInstagram', () => {
  it('adiciona @ ao handle simples', () => {
    expect(normalizeInstagram('empresa')).toBe('@empresa');
  });
  it('mantém @ já existente', () => {
    expect(normalizeInstagram('@empresa')).toBe('@empresa');
  });
  it('extrai handle de URL completa', () => {
    expect(normalizeInstagram('https://www.instagram.com/empresa/')).toBe('@empresa');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeInstagram('')).toBeNull();
  });
});

describe('normalizeLinkedin', () => {
  it('normaliza URL company com https e www', () => {
    expect(normalizeLinkedin('https://www.linkedin.com/company/xpag/')).toBe('linkedin.com/company/xpag');
  });
  it('mantém perfil /in/ intacto (sem https)', () => {
    expect(normalizeLinkedin('linkedin.com/in/joao-silva')).toBe('linkedin.com/in/joao-silva');
  });
  it('retorna null para string vazia', () => {
    expect(normalizeLinkedin('')).toBeNull();
  });
  it('retorna null para texto livre sem URL linkedin', () => {
    expect(normalizeLinkedin('João Silva')).toBeNull();
  });
});

describe('normalizeLeadRow', () => {
  it('retorna NormalizedLead válido para RawMappedLead vazio', () => {
    const result = normalizeLeadRow({});
    expect(result.empresa).toBe('');
    expect(result.lead).toBe('');
    expect(result.whatsapp).toBeNull();
    expect(result.errors).toEqual({});
    expect(result.warnings).toEqual({});
  });
  it('popula errors.whatsapp para número 0800', () => {
    const result = normalizeLeadRow({ empresa: 'Empresa', whatsapp: '0800 123 4567' });
    expect(result.errors.whatsapp).toBeTruthy();
    expect(result.whatsapp).toBeNull();
  });
  it('popula warnings.whatsapp para número fixo', () => {
    const result = normalizeLeadRow({ empresa: 'Empresa', whatsapp: '(11) 3333-4444' });
    expect(result.warnings.whatsapp).toBeTruthy();
    expect(result.errors.whatsapp).toBeUndefined();
    expect(result.whatsapp).toBe('+551133334444');
  });
  it('demote erro de telefone para warnings (não errors)', () => {
    const result = normalizeLeadRow({ empresa: 'Empresa', telefone: '99999' });
    expect(result.warnings.telefone).toBeTruthy();
    expect((result.errors as Record<string, unknown>).telefone).toBeUndefined();
  });
  it('demote erro de CNPJ para warnings', () => {
    const result = normalizeLeadRow({ empresa: 'Empresa', cnpj: '12345678000199' });
    expect(result.warnings.cnpj).toBeTruthy();
    expect((result.errors as Record<string, unknown>).cnpj).toBeUndefined();
  });
  it('normaliza todos os campos de uma vez', () => {
    const result = normalizeLeadRow({
      empresa: 'CLÍNICA SÃO PEDRO',
      lead: 'maria silva',
      whatsapp: '(11) 99999-8888',
      email: 'CONTATO@EMPRESA.COM',
      instagram: 'https://www.instagram.com/empresa/',
      linkedin: 'https://www.linkedin.com/company/empresa/',
      website: 'empresa.com.br',
    });
    expect(result.empresa).toBe('Clínica São Pedro');
    expect(result.lead).toBe('Maria Silva');
    expect(result.whatsapp).toBe('+5511999998888');
    expect(result.email).toBe('contato@empresa.com');
    expect(result.instagram).toBe('@empresa');
    expect(result.linkedin).toBe('linkedin.com/company/empresa');
    expect(result.website).toBe('https://empresa.com.br');
  });
});
