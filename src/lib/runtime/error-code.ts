/**
 * Identifica um erro só pelo código/nome, nunca pela mensagem: mensagens de
 * provedor ou do banco podem trazer telefone, payload ou detalhe interno, e
 * não vão para log nem para resposta.
 */
export function errorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return err instanceof Error ? err.name : typeof err;
}
