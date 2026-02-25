export interface WorkflowStepConfig {
  order: number;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipIf?: (ctx: WorkflowContext) => boolean;
}

export interface WorkflowContext {
  id: string;
  workflowName: string;
  currentStep: number;
  startedAt: Date;
  data: Record<string, unknown>;
  input: unknown;
}

export interface WorkflowResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  durationMs: number;
  steps: StepResult[];
}

export interface StepResult {
  name: string;
  order: number;
  success: boolean;
  durationMs: number;
  skipped?: boolean;
  error?: string;
  retries?: number;
}
