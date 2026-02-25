/**
 * API: Configuração do Agente (Prompt Editor)
 *
 * GET  /api/agent/config        — lista configs do tenant
 * POST /api/agent/config        — cria nova config (e ativa)
 * PUT  /api/agent/config        — reseta para padrão do sistema
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { agentConfigService } from '@/lib/ai/agent-config.service';
import { SYSTEM_PROMPT_V3_4, SYSTEM_PROMPT_VERSION } from '@/lib/ai/prompts/system-prompt.v3.4';

async function getAuth() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { user, supabase };
}

export async function GET() {
  const { user, supabase } = await getAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configs = await agentConfigService.list(user.id, supabase);

  // Se não há configs salvas, retorna o prompt padrão do sistema como config virtual
  if (configs.length === 0) {
    return NextResponse.json({
      configs: [{
        id: 'default',
        userId: user.id,
        name: 'Agente XPAG Padrão',
        systemPrompt: SYSTEM_PROMPT_V3_4,
        promptVersion: SYSTEM_PROMPT_VERSION,
        model: 'gpt-4.1',
        temperature: 0.7,
        maxIterations: 5,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    });
  }

  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest) {
  const { user, supabase } = await getAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxIterations?: number;
    activate?: boolean;
  };

  if (!body.systemPrompt?.trim()) {
    return NextResponse.json({ error: 'systemPrompt is required' }, { status: 400 });
  }

  const config = await agentConfigService.upsert(user.id, {
    name: body.name,
    systemPrompt: body.systemPrompt,
    promptVersion: 'custom',
    model: body.model,
    temperature: body.temperature,
    maxIterations: body.maxIterations,
    isActive: body.activate !== false,
  }, body.activate !== false, supabase);

  return NextResponse.json({ config }, { status: 201 });
}

export async function PUT() {
  const { user, supabase } = await getAuth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = await agentConfigService.resetToDefault(user.id, supabase);
  return NextResponse.json({ config, message: 'Reset to default prompt' });
}
