/**
 * POST /api/templates/personalize
 *
 * Personaliza um template de mensagem para um lead específico usando IA.
 * A IA usa a conexão `llm` da organização do usuário; sem conexão →
 * 409 LLM_NOT_CONFIGURED (sem fallback de chave).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireWriter, forbiddenWriterResponse } from '@/lib/auth/require-writer';
import {
  resolveLlmForUser,
  runWithLlm,
  recordLlmUsage,
  LLM_NOT_CONFIGURED_ERROR,
  type LlmUsage,
} from '@/lib/ai/openai-key-context';

export const runtime = 'nodejs';

const personalizeSchema = z.object({
  templateBody: z.string().trim().min(1).max(20000),
  channel: z.enum(['whatsapp', 'email']),
  lead: z.object({
    empresa: z.string().trim().min(1).max(300),
    nome: z.string().max(300).optional(),
    categoria: z.string().max(300).optional(),
    cidade: z.string().max(300).optional(),
    website: z.string().max(500).optional(),
  }),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Auth user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await requireWriter(user.id))) return forbiddenWriterResponse();

    // 2. Parse request body
    const parsed = personalizeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'templateBody, channel e lead.empresa são obrigatórios.' } },
        { status: 400 }
      );
    }
    const { templateBody, channel, lead } = parsed.data;

    // 3. IA pela conexão `llm` da organização do usuário
    const llm = await resolveLlmForUser(user.id);
    if (!llm) {
      return NextResponse.json({ error: LLM_NOT_CONFIGURED_ERROR }, { status: 409 });
    }

    // 4. Build prompt
    const systemPrompt = `You are a B2B sales assistant.
Personalize the following ${channel} template for a specific prospect.

Lead data:
- Company: ${lead.empresa}
- Contact: ${lead.nome || 'N/A'}
- Segment: ${lead.categoria || 'N/A'}
- City: ${lead.cidade || 'N/A'}
- Website: ${lead.website || 'N/A'}

Template:
${templateBody}

Instructions:
- Replace {{nome}} with the contact's first name if available, otherwise use the company name
- Replace {{empresa}} with the company name
- Replace {{cidade}} with the city
- Replace {{categoria}} with the segment
- Add one specific personalized sentence about the company/segment that makes it feel tailored
- Keep the same structure and length
- Return ONLY the personalized message, no explanations
- For WhatsApp: plain text only, no HTML
- For email: keep the HTML structure`;

    // 5. Call OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llm.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: systemPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!openaiRes.ok) {
      // Detalhe do provedor só no status: a mensagem pode citar trecho da credencial.
      console.error('[personalize] OpenAI error:', openaiRes.status);
      return NextResponse.json(
        { error: { code: 'LLM_ERROR', message: 'Falha ao gerar a personalização com IA.' } },
        { status: 502 }
      );
    }

    const openaiData = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: LlmUsage;
    };
    await runWithLlm(llm, () => recordLlmUsage(openaiData.usage, 'templates.personalize'));
    const personalizedBody = openaiData.choices?.[0]?.message?.content?.trim() || '';

    return NextResponse.json({ personalizedBody });
  } catch (err) {
    console.error('[personalize] Unexpected error:', err instanceof Error ? err.message : 'erro');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
