type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  correlationId?: string;
  workflowName?: string;
  step?: string | number;
  durationMs?: number;
  [key: string]: unknown;
}

export class WorkflowLogger {
  private correlationId: string;
  private workflowName: string;

  constructor(workflowName: string, correlationId: string) {
    this.workflowName = workflowName;
    this.correlationId = correlationId;
  }

  private log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      correlationId: this.correlationId,
      workflowName: this.workflowName,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.workflowName}] [${this.correlationId.slice(0, 8)}]`;

    if (level === 'error') {
      console.error(prefix, message, extra ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, extra ?? '');
    } else {
      console.log(prefix, message, extra ?? '');
    }

    return entry;
  }

  info(message: string, extra?: Record<string, unknown>) {
    return this.log('info', message, extra);
  }

  warn(message: string, extra?: Record<string, unknown>) {
    return this.log('warn', message, extra);
  }

  error(message: string, extra?: Record<string, unknown>) {
    return this.log('error', message, extra);
  }

  debug(message: string, extra?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      return this.log('debug', message, extra);
    }
  }

  stepStart(stepName: string, order: number) {
    this.info(`Step started: ${stepName}`, { step: stepName, order });
  }

  stepSuccess(stepName: string, durationMs: number) {
    this.info(`Step completed: ${stepName}`, { step: stepName, durationMs });
  }

  stepError(stepName: string, error: Error) {
    this.error(`Step failed: ${stepName}`, {
      step: stepName,
      error: error.message,
      stack: error.stack,
    });
  }

  stepSkipped(stepName: string) {
    this.info(`Step skipped: ${stepName}`, { step: stepName, skipped: true });
  }
}
