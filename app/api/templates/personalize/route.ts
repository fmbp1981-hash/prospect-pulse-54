/**
 * POST /api/templates/personalize
 *
 * Personaliza um template de mensagem para um lead específico usando IA.
 * Lê a chave OpenAI do tenant via user_settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface PersonalizeRequestBody {
  templateBody: string;
  channel: 'whatsapp' | 'email';
  lead: {
    empresa: string;
    nome?: string;
    categoria?: string;
    cidade?: string;
    website?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Auth user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Read OpenAI key from user_settings, fallback to env
    let openaiApiKey = process.env.OPENAI_API_KEY || '';

    const { data: settings } = await supabase
      .from('user_settings')
      .select('openai_api_key')
      .eq('user_id', user.id)
      .single();

    if (settings?.openai_api_key) {
      openaiApiKey = settings.openai_api_key as string;
    }

    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Add it in settings or set OPENAI_API_KEY env var.' },
        { status: 400 }
      );
    }

    // 3. Parse request body
    const body = await req.json() as PersonalizeRequestBody;
    const { templateBody, channel, lead } = body;

    if (!templateBody || !channel || !lead?.empresa) {
      return NextResponse.json(
        { error: 'templateBody, channel, and lead.empresa are required' },
        { status: 400 }
      );
    }

    // 4. Build prompt
    const systemPrompt = `You are a B2B sales assistant for IntelliX.AI, a Brazilian AI automation company.
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
        'Authorization': `Bearer ${openaiApiKey}`,
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
      const errData = await openaiRes.json().catch(() => ({}));
      console.error('[personalize] OpenAI error:', errData);
      return NextResponse.json(
        { error: 'OpenAI API error', details: (errData as { error?: { message?: string } }).error?.message },
        { status: 502 }
      );
    }

    const openaiData = await openaiRes.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const personalizedBody = openaiData.choices?.[0]?.message?.content?.trim() || '';

    return NextResponse.json({ personalizedBody });
  } catch (err) {
    console.error('[personalize] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
