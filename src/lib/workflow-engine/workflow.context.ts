import type { WorkflowContext } from './interfaces/workflow-step.interface';
import { randomUUID } from 'crypto';

export function createWorkflowContext(
  workflowName: string,
  input: unknown,
  initialData: Record<string, unknown> = {}
): WorkflowContext {
  return {
    id: randomUUID(),
    workflowName,
    currentStep: 0,
    startedAt: new Date(),
    data: { ...initialData },
    input,
  };
}

export function setContextData(
  ctx: WorkflowContext,
  key: string,
  value: unknown
): WorkflowContext {
  return { ...ctx, data: { ...ctx.data, [key]: value } };
}

export function mergeContextData(
  ctx: WorkflowContext,
  partial: Record<string, unknown>
): WorkflowContext {
  return { ...ctx, data: { ...ctx.data, ...partial } };
}
