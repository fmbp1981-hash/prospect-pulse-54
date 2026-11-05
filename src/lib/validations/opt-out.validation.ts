/**
 * Validação e normalização da oposição a contatos (opt-out, TASK-002).
 *
 * O banco só confere o formato (CHECK de contact_opt_outs); normalizar é
 * daqui, para que o mesmo número em formatos diferentes caia na mesma linha:
 *   - telefone: E.164. Sem "+", segue normalizeBRPhone ((11) 99999-0000,
 *     011999990000, 5511999990000 → +5511999990000). Com "+", aceita E.164
 *     internacional; "+55" exige DDD válido e 8 ou 9 dígitos.
 *   - e-mail: minúsculas, sem espaços em volta. A regra de formato é a do
 *     CHECK (permissiva de propósito: recusar um e-mail que o banco aceita
 *     impediria atender o pedido de oposição), menos aspas duplas e barra
 *     invertida, que quebrariam o filtro .in() da consulta em lote.
 */

import { z } from 'zod';
import { normalizeBRPhone } from '@/lib/normalizePhone';

export const OPT_OUT_SOURCES = [
  'link_email',
  'whatsapp_titular',
  'agente_ia',
  'usuario',
  'importacao',
] as const;
export type OptOutSource = (typeof OPT_OUT_SOURCES)[number];

/** Máximo de destinatários numa consulta em lote. */
export const OPT_OUT_LOOKUP_MAX = 1000;

const E164 = /^\+[1-9]\d{7,14}$/;
const BR_E164 = /^\+55[1-9]{2}\d{8,9}$/;
const EMAIL = /^[^@\s"\\]+@[^@\s"\\]+$/;
const MESSAGE_ID = /^[A-Za-z0-9._:@=+/-]+$/;

/** Telefone em E.164, ou null se não normalizar. */
export function normalizeOptOutPhone(raw: string): string | null {
  const trimmed = raw.trim();
  let phone: string | null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    phone = `+${digits}`;
  } else {
    phone = normalizeBRPhone(trimmed);
  }

  if (!phone || !E164.test(phone)) return null;
  if (phone.startsWith('+55') && !BR_E164.test(phone)) return null;
  return phone;
}

/** E-mail em minúsculas e sem espaços em volta, ou null se inválido. */
export function normalizeOptOutEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

const phoneField = z.string().transform((value, ctx) => {
  const phone = normalizeOptOutPhone(value);
  if (!phone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido' });
    return z.NEVER;
  }
  return phone;
});

const emailField = z.string().transform((value, ctx) => {
  const email = normalizeOptOutEmail(value);
  if (!email) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'E-mail inválido' });
    return z.NEVER;
  }
  return email;
});

const leadIdField = z.string().trim().min(1).max(200);

export const registerOptOutSchema = z
  .object({
    phone: phoneField.optional(),
    email: emailField.optional(),
    leadId: leadIdField.optional(),
    source: z.enum(OPT_OUT_SOURCES),
    /** Id da mensagem de WhatsApp que originou o pedido. Nunca o texto. */
    evidenceMessageId: z.string().max(128).regex(MESSAGE_ID, 'Id de mensagem inválido').optional(),
  })
  .refine((v) => v.phone !== undefined || v.email !== undefined, {
    message: 'Informe telefone ou e-mail',
    path: ['phone'],
  });

export type RegisterOptOutInput = z.input<typeof registerOptOutSchema>;
export type RegisterOptOutData = z.output<typeof registerOptOutSchema>;

export const revokeOptOutSchema = z.object({
  optOutId: z.string().uuid('Oposição inválida'),
  reason: z
    .string({ required_error: 'Motivo obrigatório' })
    .trim()
    .min(3, 'Motivo obrigatório (mínimo 3 caracteres)')
    .max(500, 'Motivo com no máximo 500 caracteres'),
});

export type RevokeOptOutInput = z.input<typeof revokeOptOutSchema>;
export type RevokeOptOutData = z.output<typeof revokeOptOutSchema>;

/** Um destinatário da consulta (o serviço valida cada um em separado). */
export const lookupTargetSchema = z
  .object({
    leadId: leadIdField.optional(),
    phone: phoneField.optional(),
    email: emailField.optional(),
  })
  .refine((v) => v.leadId !== undefined || v.phone !== undefined || v.email !== undefined, {
    message: 'Informe lead, telefone ou e-mail',
  });

export const lookupOptOutSchema = z.array(lookupTargetSchema).max(OPT_OUT_LOOKUP_MAX);

export type OptOutLookupTarget = z.input<typeof lookupTargetSchema>;
export type OptOutLookupTargetData = z.output<typeof lookupTargetSchema>;
