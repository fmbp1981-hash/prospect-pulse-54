/**
 * Repositório da oposição a contatos (contact_opt_outs / contact_opt_out_events).
 *
 * Registrar e revogar passam pelas funções do banco (migration 20261105120000):
 * a situação e o evento de prova mudam na mesma transação. Nada de upsert nem
 * de gravar as tabelas direto daqui.
 *
 * Consulta em lote: um .in() por identificador (lead_id, phone_e164,
 * email_normalized), nunca .or() montado com texto (e-mail pode ter vírgula ou
 * parêntese e quebraria o filtro). Cada lista vai na URL do GET; para não
 * passar do limite de tamanho da URL, uma lista grande é dividida em partes
 * de até IN_VALUES_BUDGET caracteres (então 1000 e-mails podem virar mais de
 * uma consulta por coluna).
 *
 * Sempre filtra organization_id: o cliente é service_role (sem RLS).
 * Erro do banco vira OptOutDbError: quem consulta antes de enviar trata como
 * bloqueado (falha fechada).
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/** Tamanho máximo (codificado na URL) dos valores de um .in(). */
const IN_VALUES_BUDGET = 3000;

export class OptOutDbError extends Error {
  constructor(
    public readonly code: string | null,
    message: string
  ) {
    super(message);
    this.name = 'OptOutDbError';
  }
}

export interface OptOutChange {
  optOutId: string;
  changed: boolean;
}

export interface RegisterOptOutParams {
  organizationId: string;
  phoneE164?: string;
  emailNormalized?: string;
  source: string;
  actorType: string;
  actorUserId?: string;
  leadId?: string;
  evidenceMessageId?: string;
}

export interface RevokeOptOutParams {
  organizationId: string;
  optOutId: string;
  reason: string;
  actorUserId: string;
}

export interface ActiveOptOutMatch {
  id: string;
  lead_id: string | null;
  phone_e164: string | null;
  email_normalized: string | null;
}

export interface OptOutIdentifiers {
  leadIds: string[];
  phones: string[];
  emails: string[];
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key);
}

function firstChange(data: { opt_out_id: string; changed: boolean }[] | null, fn: string): OptOutChange {
  const row = data?.[0];
  if (!row) throw new OptOutDbError(null, `${fn}: função não devolveu resultado`);
  return { optOutId: row.opt_out_id, changed: row.changed };
}

/** Divide os valores em partes cujo tamanho na URL cabe em IN_VALUES_BUDGET. */
export function chunkInValues(values: string[], budget = IN_VALUES_BUDGET): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const value of values) {
    // valor codificado + vírgula + aspas que o postgrest-js pode acrescentar
    const cost = encodeURIComponent(value).length + 7;
    if (current.length > 0 && size + cost > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(value);
    size += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

type MatchColumn = 'lead_id' | 'phone_e164' | 'email_normalized';

export const optOutRepository = {
  async register(params: RegisterOptOutParams): Promise<OptOutChange> {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('register_contact_opt_out', {
      p_organization_id: params.organizationId,
      p_source: params.source,
      p_actor_type: params.actorType,
      p_phone_e164: params.phoneE164,
      p_email_normalized: params.emailNormalized,
      p_actor_user_id: params.actorUserId,
      p_lead_id: params.leadId,
      p_evidence_message_id: params.evidenceMessageId,
    });

    if (error) throw new OptOutDbError(error.code ?? null, `optOut.register: ${error.message}`);
    return firstChange(data, 'optOut.register');
  },

  async revoke(params: RevokeOptOutParams): Promise<OptOutChange> {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('revoke_contact_opt_out', {
      p_organization_id: params.organizationId,
      p_opt_out_id: params.optOutId,
      p_reason: params.reason,
      p_actor_user_id: params.actorUserId,
    });

    if (error) throw new OptOutDbError(error.code ?? null, `optOut.revoke: ${error.message}`);
    return firstChange(data, 'optOut.revoke');
  },

  /**
   * Oposições ATIVAS da organização que batem com algum dos identificadores.
   * Listas vazias não geram consulta.
   */
  async findActiveMatches(
    organizationId: string,
    identifiers: OptOutIdentifiers
  ): Promise<ActiveOptOutMatch[]> {
    const supabase = getServiceClient();
    const byId = new Map<string, ActiveOptOutMatch>();

    const lookups: [MatchColumn, string[]][] = [
      ['lead_id', identifiers.leadIds],
      ['phone_e164', identifiers.phones],
      ['email_normalized', identifiers.emails],
    ];

    for (const [column, values] of lookups) {
      const unique = Array.from(new Set(values));
      for (const chunk of chunkInValues(unique)) {
        const { data, error } = await supabase
          .from('contact_opt_outs')
          .select('id, lead_id, phone_e164, email_normalized')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .in(column, chunk);

        if (error) {
          throw new OptOutDbError(error.code ?? null, `optOut.findActiveMatches: ${error.message}`);
        }
        for (const row of data ?? []) byId.set(row.id, row);
      }
    }

    return Array.from(byId.values());
  },
};
