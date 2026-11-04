/**
 * Schemas Zod de configuração (não secreta) e de segredo por provedor.
 */
import { z } from 'zod';
import { assertSafeOutboundUrl } from '@/lib/security/outbound-url';

const nonEmpty = z.string().trim().min(1);
const apiKeySecret = z.object({ apiKey: nonEmpty });
const emptyConfig = z.object({});

const evolutionBaseUrl = z.string().url().superRefine((value, ctx) => {
  try {
    assertSafeOutboundUrl(value);
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : 'URL de saída não permitida',
    });
  }
});

const resendConfig = z
  .object({
    domain: nonEmpty,
    fromEmail: z.string().email(),
    fromName: nonEmpty,
  })
  .superRefine((cfg, ctx) => {
    const emailDomain = cfg.fromEmail.split('@')[1]?.toLowerCase();
    if (emailDomain !== cfg.domain.trim().toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fromEmail'],
        message: 'fromEmail deve pertencer ao domain configurado',
      });
    }
  });

export const providerConfigSchemas = {
  meta_cloud: z.object({
    phoneNumberId: nonEmpty,
    wabaId: nonEmpty.optional(),
    apiVersion: nonEmpty.default('v20.0'),
  }),
  evolution: z.object({
    baseUrl: evolutionBaseUrl,
    instanceName: nonEmpty,
  }),
  resend: resendConfig,
  openai: z.object({ model: nonEmpty.optional() }),
  google_places: emptyConfig,
  apify: emptyConfig,
  firecrawl: emptyConfig,
} as const;

export const providerSecretSchemas = {
  meta_cloud: z.object({ accessToken: nonEmpty, appSecret: nonEmpty, verifyToken: nonEmpty }),
  evolution: apiKeySecret,
  resend: apiKeySecret,
  openai: apiKeySecret,
  google_places: apiKeySecret,
  apify: z.object({ apiToken: nonEmpty }),
  firecrawl: apiKeySecret,
} as const;
