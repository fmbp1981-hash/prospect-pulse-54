export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown>;
}

export interface ToolExecutionContext {
  leadId: string;
  whatsapp: string;
  instanceName: string;
  userId: string;
}
