import type {
  WorkflowContext,
  WorkflowResult,
  StepResult,
  WorkflowStepConfig,
} from './interfaces/workflow-step.interface';
import { WorkflowLogger } from './workflow.logger';
import { setContextData } from './workflow.context';

export type StepFn<T = unknown> = (ctx: WorkflowContext) => Promise<T>;

export interface StepDefinition {
  name: string;
  config: WorkflowStepConfig;
  fn: StepFn;
  resultKey?: string;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stepName: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Step "${stepName}" timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delay: number,
  stepName: string,
  logger: WorkflowLogger
): Promise<{ result: T; attempts: number }> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxAttempts) {
        logger.warn(`Step "${stepName}" failed on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`, {
          attempt,
          error: lastError.message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

export class WorkflowOrchestrator {
  constructor(
    private readonly workflowName: string,
    private readonly steps: StepDefinition[]
  ) {
    // Sort steps by order
    this.steps = [...steps].sort((a, b) => a.config.order - b.config.order);
  }

  async execute(ctx: WorkflowContext): Promise<WorkflowResult> {
    const logger = new WorkflowLogger(this.workflowName, ctx.id);
    const stepResults: StepResult[] = [];
    const globalStart = Date.now();

    logger.info('Workflow started', { input: JSON.stringify(ctx.input).slice(0, 200) });

    let currentCtx = ctx;

    for (const step of this.steps) {
      const { name, config, fn, resultKey } = step;
      const stepStart = Date.now();

      currentCtx = { ...currentCtx, currentStep: config.order };

      // Check skipIf condition
      if (config.skipIf && config.skipIf(currentCtx)) {
        logger.stepSkipped(name);
        stepResults.push({
          name,
          order: config.order,
          success: true,
          durationMs: 0,
          skipped: true,
        });
        continue;
      }

      logger.stepStart(name, config.order);

      try {
        const maxAttempts = config.retries ? config.retries + 1 : 1;
        const retryDelay = config.retryDelay ?? 1000;

        const { result, attempts } = await withRetry(
          () => {
            const stepFn = () => fn(currentCtx);
            return config.timeout
              ? withTimeout(stepFn(), config.timeout, name)
              : stepFn();
          },
          maxAttempts,
          retryDelay,
          name,
          logger
        );

        const durationMs = Date.now() - stepStart;

        // Store result in context if a key is defined
        if (resultKey && result !== undefined) {
          currentCtx = setContextData(currentCtx, resultKey, result);
        }

        logger.stepSuccess(name, durationMs);

        stepResults.push({
          name,
          order: config.order,
          success: true,
          durationMs,
          retries: attempts - 1,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const durationMs = Date.now() - stepStart;

        logger.stepError(name, error);

        stepResults.push({
          name,
          order: config.order,
          success: false,
          durationMs,
          error: error.message,
        });

        const totalDuration = Date.now() - globalStart;
        logger.error('Workflow failed', { step: name, totalDurationMs: totalDuration });

        return {
          success: false,
          error,
          durationMs: totalDuration,
          steps: stepResults,
        };
      }
    }

    const totalDuration = Date.now() - globalStart;
    logger.info('Workflow completed successfully', { totalDurationMs: totalDuration });

    return {
      success: true,
      data: currentCtx.data,
      durationMs: totalDuration,
      steps: stepResults,
    };
  }
}
