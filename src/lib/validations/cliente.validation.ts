import * as z from 'zod';

// PATCH /api/clientes/[id] — allowlist dos campos de contato/empresa editáveis.
// .strict(): qualquer outro campo (organization_id, user_id, lead_id_original,
// created_at, data_conversao...) → 400. A rota grava com service_role, então o
// banco não filtra nada por ela (achado F-06).
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const clientePatchSchema = z
  .object({
    empresa: z.string().trim().min(1).max(300),
    contato: optionalText(300),
    whatsapp: optionalText(40),
    telefone: optionalText(40),
    email: optionalText(320),
    cidade: optionalText(200),
    bairro: optionalText(200),
    endereco: optionalText(500),
    categoria: optionalText(200),
    cnpj: optionalText(30),
    website: optionalText(500),
    instagram: optionalText(200),
    observacoes: optionalText(5000),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).nullable(),
    status: optionalText(50),
    origem: optionalText(100),
    consultor_responsavel: optionalText(200),
    aceita_cartao: optionalText(50),
    usa_meios_pagamento: optionalText(200),
    faturamento_declarado: z.number().nonnegative().nullable(),
  })
  .partial()
  .strict();

export type ClientePatch = z.infer<typeof clientePatchSchema>;
