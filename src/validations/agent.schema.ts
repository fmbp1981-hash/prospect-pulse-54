// src/validations/agent.schema.ts
import { z } from 'zod'

export const agentConfigSchema = z.object({
  name: z.string().min(1).max(100),
  systemPrompt: z.string().min(10, 'Prompt muito curto'),
  model: z.enum(['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.1-mini']),
  temperature: z.number().min(0).max(2),
  maxIterations: z.number().int().min(1).max(10),
})

export type AgentConfigInput = z.infer<typeof agentConfigSchema>
