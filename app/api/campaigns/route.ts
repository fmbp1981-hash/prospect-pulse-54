/**
 * GET  /api/campaigns — lista campanhas do tenant
 * POST /api/campaigns — cria nova campanha
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('campaigns')
    .select('id, name, description, channel, status, total_sent, total_failed, created_at, scheduled_at, started_at, completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name: string;
    description?: string;
    channel: 'whatsapp' | 'email';
    subject?: string;
    body: string;
    audienceFilter?: Record<string, unknown>;
    scheduledAt?: string;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
  if (!body.body?.trim()) return NextResponse.json({ error: 'body é obrigatório' }, { status: 400 });
  if (!['whatsapp', 'email'].includes(body.channel)) {
    return NextResponse.json({ error: 'channel deve ser whatsapp ou email' }, { status: 400 });
  }
  if (body.channel === 'email' && !body.subject?.trim()) {
    return NextResponse.json({ error: 'subject é obrigatório para campanhas de email' }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('campaigns')
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      description: body.description ?? null,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body.trim(),
      audience_filter: body.audienceFilter ?? null,
      scheduled_at: body.scheduledAt ?? null,
      status: 'draft',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data }, { status: 201 });
}
