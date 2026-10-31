/**
 * E-mail por organização (Sprint 2b).
 *
 * - getEmailSenderForOrganization: conexão `active` de e-mail da organização
 *   (domínio do cliente). Sem conexão → ConnectionNotConfiguredError, sem
 *   fallback para env, user_settings ou outra organização.
 * - getPlatformEmailSender: e-mails de sistema da IntelliX aos usuários
 *   (aprovação, teste), via platform_credentials.resend.
 */
import { z } from 'zod';
import { resolveConnection } from '../resolve-connection';
import { recordUsage } from '../usage';
import { decryptJson, type EncryptedSecret } from '../crypto/secret-box';
import { providerSecretSchemas } from '../schemas';
import { connectionsRepository } from '@/lib/repositories/connections.repository';
import { createResendSender, type EmailSender } from './resend.adapter';

export type { EmailSender, EmailMessage, EmailSendResult } from './resend.adapter';
export { checkResendDomainVerified } from './resend.adapter';

export const EMAIL_NOT_CONFIGURED_ERROR = {
  code: 'EMAIL_NOT_CONFIGURED',
  message: 'E-mail não configurado para esta organização. Fale com a equipe IntelliX.',
} as const;

export class PlatformEmailNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`E-mail da plataforma não configurado: ${reason}`);
    this.name = 'PlatformEmailNotConfiguredError';
  }
}

const platformEmailConfigSchema = z.object({
  fromEmail: z.string().trim().email(),
  fromName: z.string().trim().min(1),
});

export async function getEmailSenderForOrganization(organizationId: string): Promise<EmailSender> {
  const conn = await resolveConnection(organizationId, 'email');
  const c = conn as Awaited<ReturnType<typeof resolveConnection<'resend'>>>;
  const inner = createResendSender({
    apiKey: c.secret.apiKey,
    from: `${c.config.fromName} <${c.config.fromEmail}>`,
  });

  return {
    from: inner.from,
    async sendBatch(messages) {
      const result = await inner.sendBatch(messages);
      if (result.sent > 0) {
        await recordUsage({
          organizationId: c.organizationId,
          connectionId: c.id,
          category: 'email',
          provider: 'resend',
          operation: 'send_batch',
          quantity: result.sent,
          unit: 'emails',
        });
      }
      return result;
    },
  };
}

export async function getPlatformEmailSender(): Promise<EmailSender> {
  const row = await connectionsRepository.getPlatformCredential('resend');
  if (!row) throw new PlatformEmailNotConfiguredError('credencial da plataforma ausente');

  const secret = providerSecretSchemas.resend.parse(
    await decryptJson<unknown>(row.secret as unknown as EncryptedSecret)
  );
  const config = platformEmailConfigSchema.safeParse(row.config);
  if (!config.success) {
    throw new PlatformEmailNotConfiguredError('config.fromEmail/fromName ausente ou inválido');
  }

  return createResendSender({
    apiKey: secret.apiKey,
    from: `${config.data.fromName} <${config.data.fromEmail}>`,
  });
}
