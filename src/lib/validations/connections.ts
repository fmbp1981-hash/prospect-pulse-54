/**
 * Validação das rotas de admin de conexões (Sprint 2b).
 *
 * `config` e `secret` são validados pelo schema Zod do provedor; o segredo é
 * opcional no PUT (ausente = mantém o atual), mas quando presente precisa
 * estar completo e sem campos vazios.
 */
import { z } from 'zod';
import { providerConfigSchemas, providerSecretSchemas } from '@/lib/connectors/schemas';
import type { ConnectorCategory, ProviderId } from '@/lib/connectors/types';

export const PROVIDER_IDS = [
  'meta_cloud',
  'evolution',
  'resend',
  'openai',
  'google_places',
  'apify',
  'firecrawl',
] as const satisfies readonly ProviderId[];

export const PROVIDER_CATEGORY: Record<ProviderId, ConnectorCategory> = {
  meta_cloud: 'whatsapp',
  evolution: 'whatsapp',
  resend: 'email',
  openai: 'llm',
  google_places: 'prospecting',
  apify: 'prospecting',
  firecrawl: 'prospecting',
};

const providerSchema = z.enum(PROVIDER_IDS);
const categorySchema = z.enum(['whatsapp', 'email', 'llm', 'prospecting']);
const plainObject = z.record(z.string(), z.unknown());
const secretInput = z.record(z.string(), z.string());

export const orgIdParamsSchema = z.object({ orgId: z.string().uuid() });
export const connectionParamsSchema = z.object({
  orgId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

function addIssues(ctx: z.RefinementCtx, base: string, error: z.ZodError) {
  for (const issue of error.issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [base, ...issue.path],
      message: issue.message,
    });
  }
}

export const upsertConnectionSchema = z
  .object({
    category: categorySchema,
    provider: providerSchema,
    credentialSource: z.enum(['platform', 'own']),
    config: plainObject,
    secret: secretInput.optional(),
  })
  .strict()
  .transform((body, ctx) => {
    if (PROVIDER_CATEGORY[body.provider] !== body.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: `provedor ${body.provider} não pertence à categoria ${body.category}`,
      });
      return z.NEVER;
    }
    const config = providerConfigSchemas[body.provider].safeParse(body.config);
    if (!config.success) {
      addIssues(ctx, 'config', config.error);
      return z.NEVER;
    }
    let secret: Record<string, string> | undefined;
    if (body.secret !== undefined) {
      const parsed = providerSecretSchemas[body.provider].strict().safeParse(body.secret);
      if (!parsed.success) {
        addIssues(ctx, 'secret', parsed.error);
        return z.NEVER;
      }
      secret = parsed.data as Record<string, string>;
    }
    return {
      category: body.category,
      provider: body.provider,
      credentialSource: body.credentialSource,
      config: config.data as Record<string, unknown>,
      secret,
    };
  });

export type UpsertConnectionBody = z.output<typeof upsertConnectionSchema>;

export const updateConnectionStatusSchema = z
  .object({ status: z.enum(['active', 'disabled']) })
  .strict();

/**
 * Config (não secreta) das credenciais da PLATAFORMA, por provedor. Só o
 * Resend tem config (remetente dos e-mails do sistema; o domínio é o da conta
 * da plataforma). Chaves desconhecidas são descartadas (strip), nunca
 * gravadas nem devolvidas.
 */
const emptyPlatformConfig = z.object({});
export const platformCredentialConfigSchemas = {
  meta_cloud: emptyPlatformConfig,
  evolution: emptyPlatformConfig,
  resend: z.object({
    fromEmail: z.string().trim().email(),
    fromName: z.string().trim().min(1),
  }),
  openai: emptyPlatformConfig,
  google_places: emptyPlatformConfig,
  apify: emptyPlatformConfig,
  firecrawl: emptyPlatformConfig,
} as const satisfies Record<ProviderId, z.ZodObject<z.ZodRawShape>>;

/** Mantém só os campos de config conhecidos do provedor (para exibir). */
export function pickPlatformCredentialConfig(
  provider: ProviderId,
  config: unknown
): Record<string, string> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const source = config as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(platformCredentialConfigSchemas[provider].shape)) {
    const value = source[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export const upsertPlatformCredentialSchema = z
  .object({
    provider: providerSchema,
    secret: secretInput,
    config: plainObject.default({}),
  })
  .strict()
  .transform((body, ctx) => {
    const parsed = providerSecretSchemas[body.provider].strict().safeParse(body.secret);
    if (!parsed.success) {
      addIssues(ctx, 'secret', parsed.error);
      return z.NEVER;
    }
    const config = platformCredentialConfigSchemas[body.provider].safeParse(body.config);
    if (!config.success) {
      addIssues(ctx, 'config', config.error);
      return z.NEVER;
    }
    return {
      provider: body.provider,
      secret: parsed.data as Record<string, string>,
      config: config.data as Record<string, string>,
    };
  });

export type UpsertPlatformCredentialBody = z.output<typeof upsertPlatformCredentialSchema>;
