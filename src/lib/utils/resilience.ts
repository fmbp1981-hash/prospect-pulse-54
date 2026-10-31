/**
 * Utilitários de resiliência para chamadas externas.
 * Circuit Breaker, retry exponencial, timeout seguro.
 */

// ─── TIMEOUT ────────────────────────────────────────────────────────────────

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout: "${label}" exceeded ${ms}ms`)), ms)
    ),
  ]);
}

// ─── RETRY EXPONENCIAL ───────────────────────────────────────────────────────

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 500,
    factor = 2,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = opts;

  let lastError: Error = new Error('Unknown');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt >= maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(initialDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// ─── CIRCUIT BREAKER ─────────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold?: number; // falhas antes de abrir
  successThreshold?: number; // sucessos para fechar do HALF_OPEN
  timeoutMs?: number;        // tempo até tentar HALF_OPEN
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitBreakerOptions = {}
  ) {}

  private get failureThreshold() { return this.opts.failureThreshold ?? 5; }
  private get successThreshold() { return this.opts.successThreshold ?? 2; }
  private get timeoutMs() { return this.opts.timeoutMs ?? 60000; }

  /**
   * @param countsAsFailure decide se um erro conta para abrir o circuito
   *   (padrão: todo erro). Erros que não contam são relançados sem afetar o estado.
   */
  async call<T>(fn: () => Promise<T>, countsAsFailure: (err: unknown) => boolean = () => true): Promise<T> {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.lastFailureAt ?? 0);
      if (elapsed < this.timeoutMs) {
        throw new Error(`Circuit breaker OPEN for "${this.name}" — retry in ${Math.ceil((this.timeoutMs - elapsed) / 1000)}s`);
      }
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      if (countsAsFailure(err)) this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        console.log(`[CircuitBreaker] "${this.name}" CLOSED`);
      }
    }
  }

  private onFailure() {
    this.failures++;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      console.error(`[CircuitBreaker] "${this.name}" OPEN after ${this.failures} failures`);
    }
  }

  get currentState(): CircuitState { return this.state; }
}

// Singletons para APIs externas
export const openAICircuit = new CircuitBreaker('OpenAI', { failureThreshold: 3, timeoutMs: 30000 });

// ─── CIRCUITO POR CONEXÃO (provedores de WhatsApp) ─────────────────────────
// T5-ISO-01: um circuito por conexão, para que falhas de uma organização
// nunca bloqueiem o envio das outras.

/** Erro HTTP do provedor, com o status para classificar 4xx vs 5xx. */
export class ProviderHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
  }
}

/**
 * 4xx de validação (número inválido, payload recusado) é erro do pedido, não
 * indisponibilidade do provedor: não conta para o circuito e não é repetido.
 * 429 (rate limit) e 408 contam como indisponibilidade.
 */
export function isClientRequestError(err: unknown): boolean {
  return (
    err instanceof ProviderHttpError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 408 &&
    err.status !== 429
  );
}

export const countsAsProviderFailure = (err: unknown): boolean => !isClientRequestError(err);

const PROVIDER_CIRCUIT_OPTIONS: Record<'evolution' | 'meta', CircuitBreakerOptions> = {
  evolution: { failureThreshold: 5, timeoutMs: 60000 },
  meta: { failureThreshold: 3, timeoutMs: 30000 },
};

const providerCircuits = new Map<string, CircuitBreaker>();

/**
 * Circuito da conexão `key` (connectionId; sem ele, um identificador do
 * destino, ex.: baseUrl ou phoneNumberId). `label` aparece nos logs: não
 * passe URL nem segredo.
 */
export function getProviderCircuit(kind: 'evolution' | 'meta', key: string, label: string): CircuitBreaker {
  const mapKey = `${kind}:${key}`;
  let circuit = providerCircuits.get(mapKey);
  if (!circuit) {
    circuit = new CircuitBreaker(`${kind}:${label}`, PROVIDER_CIRCUIT_OPTIONS[kind]);
    providerCircuits.set(mapKey, circuit);
  }
  return circuit;
}

/** Apenas para testes: descarta todos os circuitos por conexão. */
export function resetProviderCircuitsForTests(): void {
  providerCircuits.clear();
}
