/**
 * Serviço de supressão LinkedIn — efetiva o direito ao apagamento/oposição
 * (LGPD Art. 18) para contatos coletados via prospecção LinkedIn.
 *
 * Duas ações, sempre juntas: (1) apaga o contato já armazenado, (2) registra
 * o slug na lista de supressão para nunca mais ser recriado por uma busca
 * futura (linkedinSuppressionRepository.filterSuppressed já é consultado
 * antes de todo upsert em contacts — ver linkedin-prospecting.service.ts).
 */

import { contactsRepository } from '@/lib/repositories/contacts.repository';
import { linkedinSuppressionRepository } from '@/lib/repositories/linkedin-suppression.repository';
import type { LinkedinSuppressInput } from '@/lib/validations/linkedin-suppress.validation';

export const linkedinSuppressionService = {
  async suppressContact(userId: string, input: LinkedinSuppressInput): Promise<void> {
    await linkedinSuppressionRepository.suppress(userId, input.linkedinSlug, input.reason);
    await contactsRepository.deleteByLinkedinSlug(userId, input.linkedinSlug);
  },
};
