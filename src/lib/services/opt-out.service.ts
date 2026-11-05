/**
 * Serviço da oposição a contatos (opt-out, LGPD art. 18): registrar, revogar e
 * consultar se uma pessoa está bloqueada na organização.
 *
 * Regras:
 *  - A organização vem resolvida pelo chamador (rota/job), nunca do corpo da
 *    requisição.
 *  - Registrar: autor 'usuario' precisa ser admin/operador (requireWriter);
 *    titular, agente de IA e sistema registram sem usuário. A origem precisa
 *    combinar com o autor (SOURCES_BY_ACTOR).
 *  - Revogar: só admin da organização (requireOrgAdmin), com motivo.
 *  - Permissão é conferida antes da validação e antes de tocar o banco.
 *  - Registro e revogação gravam situação + evento numa transação (funções do
 *    banco); pedido repetido devolve changed = false e não grava evento.
 *  - Consulta: erro do banco é lançado (OptOutError DB_ERROR). Quem consulta
 *    antes de enviar deve tratar o erro como bloqueado e não enviar.
 */

import { requireOrgAdmin, requireWriter } from '@/lib/auth/require-writer';
import {
  OptOutDbError,
  optOutRepository,
  type ActiveOptOutMatch,
} from '@/lib/repositories/opt-out.repository';
import {
  OPT_OUT_LOOKUP_MAX,
  lookupTargetSchema,
  registerOptOutSchema,
  revokeOptOutSchema,
  type OptOutLookupTarget,
  type OptOutSource,
} from '@/lib/validations/opt-out.validation';
import type { ZodError } from 'zod';

export type OptOutActor =
  | { type: 'usuario'; userId: string }
  | { type: 'titular' | 'agente_ia' | 'sistema' };

export type OptOutActorType = OptOutActor['type'];

export type OptOutErrorCode = 'FORBIDDEN' | 'VALIDATION_ERROR' | 'NOT_FOUND' | 'DB_ERROR';

export class OptOutError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: OptOutErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'OptOutError';
  }
}

export interface OptOutResult {
  optOutId: string;
  changed: boolean;
  status: 'active' | 'revoked';
}

export interface OptOutLookupResult {
  blocked: boolean;
  /** Oposições ativas que bateram (lead, telefone ou e-mail). */
  optOutIds: string[];
  /** Destinatário que não passou na validação: volta bloqueado, sem consulta. */
  invalid?: true;
}

/** Origens que cada tipo de autor pode declarar. */
const SOURCES_BY_ACTOR: Record<OptOutActorType, readonly OptOutSource[]> = {
  usuario: ['usuario', 'importacao'],
  titular: ['link_email', 'whatsapp_titular'],
  agente_ia: ['agente_ia'],
  sistema: ['link_email', 'whatsapp_titular', 'importacao'],
};

function validationError(error: ZodError): OptOutError {
  return new OptOutError(400, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Dados inválidos');
}

function requireOrganization(organizationId: string): void {
  if (!organizationId) {
    throw new OptOutError(400, 'VALIDATION_ERROR', 'Organização não resolvida');
  }
}

/** Traduz o SQLSTATE das funções do banco (ver migration 20261105120000). */
function mapDbError(error: unknown): OptOutError {
  if (error instanceof OptOutDbError) {
    switch (error.code) {
      case 'P0002':
        return new OptOutError(404, 'NOT_FOUND', 'Oposição não encontrada');
      case '42501':
        return new OptOutError(403, 'FORBIDDEN', 'Seu papel não permite esta ação.');
      case '22023':
      case '23514':
      case '23503':
        return new OptOutError(400, 'VALIDATION_ERROR', 'Dados recusados pelo banco');
    }
  }
  console.error('[opt-out] Falha no banco:', error instanceof Error ? error.message : error);
  return new OptOutError(500, 'DB_ERROR', 'Falha ao gravar ou consultar a oposição');
}

export const optOutService = {
  async register(organizationId: string, input: unknown, actor: OptOutActor): Promise<OptOutResult> {
    requireOrganization(organizationId);

    if (actor.type === 'usuario' && !(await requireWriter(actor.userId))) {
      throw new OptOutError(403, 'FORBIDDEN', 'Seu papel não permite esta ação.');
    }

    const parsed = registerOptOutSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    const data = parsed.data;

    if (!SOURCES_BY_ACTOR[actor.type].includes(data.source)) {
      throw new OptOutError(400, 'VALIDATION_ERROR', 'Origem incompatível com o autor');
    }

    try {
      const result = await optOutRepository.register({
        organizationId,
        phoneE164: data.phone,
        emailNormalized: data.email,
        source: data.source,
        actorType: actor.type,
        actorUserId: actor.type === 'usuario' ? actor.userId : undefined,
        leadId: data.leadId,
        evidenceMessageId: data.evidenceMessageId,
      });
      return { ...result, status: 'active' };
    } catch (error) {
      throw mapDbError(error);
    }
  },

  async revoke(organizationId: string, input: unknown, actor: { userId: string }): Promise<OptOutResult> {
    requireOrganization(organizationId);

    if (!(await requireOrgAdmin(actor.userId))) {
      throw new OptOutError(403, 'FORBIDDEN', 'Apenas administradores da organização podem revogar.');
    }

    const parsed = revokeOptOutSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);

    try {
      const result = await optOutRepository.revoke({
        organizationId,
        optOutId: parsed.data.optOutId,
        reason: parsed.data.reason,
        actorUserId: actor.userId,
      });
      return { ...result, status: 'revoked' };
    } catch (error) {
      throw mapDbError(error);
    }
  },

  /**
   * Para cada destinatário (na mesma ordem), diz se há oposição ativa na
   * organização pelo lead, telefone ou e-mail. Até OPT_OUT_LOOKUP_MAX itens.
   * Destinatário inválido (ex.: telefone que não normaliza) volta
   * { blocked: true, invalid: true } sem derrubar os demais.
   */
  async checkBlocked(organizationId: string, targets: OptOutLookupTarget[]): Promise<OptOutLookupResult[]> {
    requireOrganization(organizationId);

    if (!Array.isArray(targets) || targets.length > OPT_OUT_LOOKUP_MAX) {
      throw new OptOutError(400, 'VALIDATION_ERROR', `Informe até ${OPT_OUT_LOOKUP_MAX} destinatários`);
    }
    if (targets.length === 0) return [];

    // Cada destinatário é validado em separado: um cadastro ruim não derruba o
    // lote; ele volta bloqueado e marcado como inválido (falha fechada).
    const items = targets.map((target) => {
      const parsed = lookupTargetSchema.safeParse(target);
      return parsed.success ? parsed.data : null;
    });

    const leadIds: string[] = [];
    const phones: string[] = [];
    const emails: string[] = [];
    for (const item of items) {
      if (item === null) continue;
      if (item.leadId !== undefined) leadIds.push(item.leadId);
      if (item.phone !== undefined) phones.push(item.phone);
      if (item.email !== undefined) emails.push(item.email);
    }

    let matches: ActiveOptOutMatch[] = [];
    if (leadIds.length + phones.length + emails.length > 0) {
      try {
        matches = await optOutRepository.findActiveMatches(organizationId, { leadIds, phones, emails });
      } catch (error) {
        throw mapDbError(error);
      }
    }

    return items.map((item): OptOutLookupResult => {
      if (item === null) return { blocked: true, optOutIds: [], invalid: true };
      const optOutIds = matches
        .filter(
          (m) =>
            (item.leadId !== undefined && m.lead_id === item.leadId) ||
            (item.phone !== undefined && m.phone_e164 === item.phone) ||
            (item.email !== undefined && m.email_normalized === item.email)
        )
        .map((m) => m.id);
      return { blocked: optOutIds.length > 0, optOutIds };
    });
  },

  /** Atalho de checkBlocked para um destinatário. */
  async isBlocked(organizationId: string, target: OptOutLookupTarget): Promise<OptOutLookupResult> {
    const [result] = await optOutService.checkBlocked(organizationId, [target]);
    return result;
  },
};
